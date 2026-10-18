#!/usr/bin/env python3
"""Crawl AIM chapters, sections, and figures from the official FAA publication."""

import json
import math
import re
import shutil
import subprocess
import sys
import time
from copy import copy
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests
from bs4 import BeautifulSoup, NavigableString, Tag
from lxml import etree
from PIL import Image, UnidentifiedImageError
from tqdm import tqdm

from clean_data import clean_text

BASE_URL = "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/"
AIM_INDEX_URL = urljoin(BASE_URL, "index.html")

# Output directory
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data" / "aim"
IMAGES_DIR = SCRIPT_DIR.parent / "web" / "public" / "aim" / "images"

# Request settings
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; FARAIMPro/1.0; Educational Aviation App)"}
REQUEST_DELAY = 1.25
PAGE_CACHE: dict[str, str] = {}
IMAGE_CACHE: dict[str, bytes] = {}
SESSION = requests.Session()
PDF_CACHE: dict[str, bytes] = {}
PUBLICATIONS_URL = "https://www.faa.gov/air_traffic/publications/"
# The ATPubs July 2026 HTML incorrectly reuses FIG 6-5-3 for all three hand signals.
# The FAA's parallel AIM HTML has the distinct figures and their correct labels:
# https://www.faa.gov/air_traffic/publications/aim_html/chap6_section_5.html
HAND_SIGNAL_FIGURES = {
    "Recommend Evacuation": ("6-5-1", "aim_fig_6_5_1.webp"),
    "Recommend Stop": ("6-5-2", "aim_fig_6_5_2.webp"),
    "Emergency Contained": ("6-5-3", "aim_fig_6_5_3.webp"),
}
# Appendix 1 repeats this 506 x 76, entirely white HTML-export footer twice.
LAYOUT_IMAGE_FILENAMES = {"aimapd1_BlankFooter0.png"}
# These current-source exports are blank or too complex to render reliably. The
# resolver requires a matching current-PDF caption before choosing an FAA mirror asset.
BROKEN_FIGURE_FILENAMES = {
    "aim0503_Auto4.png",
    "aim0603_fig191_recovered.svg",
    "aim0603_fig192_recovered.svg",
}
VERIFIED_ASSET_REPAIR_PDF_SHA256 = (
    "8b11e7a168e1ef9ea16853b8ab7b3353f01490dffb51f2736a0a72e6278f8ff5"
)


def require_verified_asset_repairs(resolver) -> None:
    if resolver is None or resolver.catalog.source_sha256 != VERIFIED_ASSET_REPAIR_PDF_SHA256:
        raise ValueError(
            "FAA AIM image fallback needs revalidation against the current PDF edition"
        )


def load_figure_resolver(effective_date: str):
    from aim_figures import FigureCatalog, FigureResolver

    publications_html = fetch_page(PUBLICATIONS_URL)
    if not publications_html:
        raise RuntimeError("Could not fetch FAA publication links for the current AIM PDF")
    soup = BeautifulSoup(publications_html, "lxml")
    pdf_urls = {
        urljoin(PUBLICATIONS_URL, link["href"])
        for link in soup.select("a[href]")
        if urlsplit(link["href"]).path.lower().endswith(".pdf")
        and re.search(r"Aeronautical Information Manual.*Basic", link.get_text(" ", strip=True))
    }
    if len(pdf_urls) != 1:
        raise ValueError("FAA publication page must identify exactly one current AIM Basic PDF")
    pdf_url = pdf_urls.pop()
    if pdf_url not in PDF_CACHE:
        for attempt in range(5):
            try:
                time.sleep(REQUEST_DELAY)
                response = SESSION.get(pdf_url, headers=HEADERS, timeout=90)
                response.raise_for_status()
                if not response.content.startswith(b"%PDF-"):
                    raise ValueError("FAA AIM PDF response is not a PDF")
                PDF_CACHE[pdf_url] = response.content
                break
            except requests.RequestException:
                if attempt == 4:
                    raise
                time.sleep(2**attempt)
    catalog = FigureCatalog.from_pdf(
        PDF_CACHE[pdf_url], pdf_url, expected_effective_date=effective_date
    )
    return FigureResolver(catalog, fetch_page)


def normalize_image(content: bytes) -> bytes:
    """Rasterize self-contained FAA SVG figures for every offline reader."""
    try:
        with Image.open(BytesIO(content)) as image:
            image.load()
            if image.format == "WEBP":
                png = BytesIO()
                image.convert("RGBA").save(png, format="PNG")
                return png.getvalue()
        return content
    except (UnidentifiedImageError, OSError):
        pass

    if len(content) > 20 * 1024 * 1024:
        raise ValueError("AIM SVG exceeds the 20 MiB input limit")
    try:
        root = etree.fromstring(
            content,
            parser=etree.XMLParser(resolve_entities=False, no_network=True, remove_comments=True),
        )
    except etree.XMLSyntaxError as error:
        raise ValueError("AIM figure is not a decodable image") from error
    if root.tag != "{http://www.w3.org/2000/svg}svg" or root.getroottree().docinfo.doctype:
        raise ValueError("AIM figure is not a self-contained SVG")

    for node in root.iter():
        for attribute, value in node.attrib.items():
            if etree.QName(attribute).localname == "href" and not value.startswith(
                ("#", "data:image/")
            ):
                raise ValueError("AIM SVG references an external resource")
        style = node.get("style", "") + (node.text or "" if node.tag.endswith("}style") else "")
        references = re.findall(r"url\(\s*([^)]+)\)", style, re.IGNORECASE)
        if "@import" in style.lower() or any(
            not value.strip(" \t\r\n'\"").startswith("#") for value in references
        ):
            raise ValueError("AIM SVG references an external style resource")

    view_box = root.get("viewBox", "")
    try:
        _, _, width, height = [float(value) for value in re.split(r"[\s,]+", view_box.strip())]
    except ValueError as error:
        raise ValueError("AIM SVG requires a valid viewBox") from error
    if not all(math.isfinite(value) and value > 0 for value in (width, height)):
        raise ValueError("AIM SVG has invalid dimensions")
    scale = 1600 / max(width, height)
    output_width, output_height = max(1, round(width * scale)), max(1, round(height * scale))
    try:
        rendered = subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys, resvg_py; sys.stdout.buffer.write(resvg_py.svg_to_bytes("
                "svg_string=sys.stdin.read(), width=int(sys.argv[1]), height=int(sys.argv[2]), "
                "dpi=96, background='white', skip_system_fonts=True))",
                str(output_width),
                str(output_height),
            ],
            input=etree.tostring(root, encoding="utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired as error:
        raise ValueError("AIM SVG rendering exceeded 30 seconds") from error
    except subprocess.CalledProcessError as error:
        raise ValueError("AIM SVG could not be rendered") from error
    return rendered.stdout


def fetch_page(url: str, retries: int = 5) -> str | None:
    """Fetch a page with retries and delay."""
    if url in PAGE_CACHE:
        return PAGE_CACHE[url]

    for attempt in range(retries):
        try:
            time.sleep(REQUEST_DELAY)
            response = SESSION.get(url, headers=HEADERS, timeout=30)
            response.raise_for_status()
            PAGE_CACHE[url] = response.text
            return response.text
        except requests.RequestException as e:
            print(f"  Attempt {attempt + 1}/{retries} failed for {url}: {e}")
            if attempt < retries - 1:
                status = e.response.status_code if e.response is not None else None
                time.sleep(30 * (attempt + 1) if status == 403 else 2**attempt)
    return None


def download_image(url: str, save_path: Path, retries: int = 5) -> bool:
    """Download an expected figure, failing if the server returns unusable content."""
    content = IMAGE_CACHE.get(url)
    if content is None:
        for attempt in range(retries):
            try:
                time.sleep(REQUEST_DELAY)
                response = SESSION.get(url, headers=HEADERS, timeout=30)
                response.raise_for_status()
                content = response.content
                IMAGE_CACHE[url] = content
                break
            except requests.RequestException as e:
                print(f"  Attempt {attempt + 1}/{retries} failed for image {url}: {e}")
                if attempt < retries - 1:
                    status = e.response.status_code if e.response is not None else None
                    time.sleep(30 * (attempt + 1) if status == 403 else 2**attempt)

    if content is None:
        raise RuntimeError(f"Could not download AIM image after retries: {url}")

    try:
        content = normalize_image(content)
    except ValueError as error:
        raise RuntimeError(f"Invalid AIM image from {url}: {error}") from error
    if not image_has_visible_content(content):
        raise RuntimeError(f"Expected AIM figure is blank: {url}")

    save_path.parent.mkdir(parents=True, exist_ok=True)
    save_path.write_bytes(content)
    return True


def image_has_visible_content(content: bytes) -> bool:
    """Return whether an image contains a non-white visible pixel."""
    try:
        with Image.open(BytesIO(content)) as source:
            image = source.convert("RGBA")
    except (UnidentifiedImageError, OSError):
        return False

    white_background = Image.new("RGBA", image.size, "white")
    white_background.alpha_composite(image)
    minimum, _ = white_background.convert("L").getextrema()
    return minimum < 250


def clean_html_content(elem: Tag, base_url: str = "") -> str:
    """
    Convert HTML element to clean text while preserving formatting.
    - Keeps links (as markdown-style or with URL)
    - Adds proper spacing around list markers like (1), (i), (a)
    - Preserves paragraph breaks
    - Removes scripts and styles
    """
    if elem is None:
        return ""

    # Remove scripts, styles, and other unwanted elements
    for tag in elem.find_all(["script", "style", "noscript", "iframe"]):
        tag.decompose()

    def process_node(node, depth=0) -> str:
        if isinstance(node, NavigableString):
            text = str(node)
            return text

        if not isinstance(node, Tag):
            return ""

        tag_name = node.name.lower() if node.name else ""

        # Skip certain tags entirely
        if tag_name in ["script", "style", "noscript", "head", "meta", "link"]:
            return ""

        # Process children
        children_text = ""
        for child in node.children:
            children_text += process_node(child, depth + 1)

        # Handle specific tags
        if tag_name == "img":
            alt = node.get("alt", "").strip()
            return f" {alt} " if alt else ""

        if tag_name == "a":
            href = node.get("href", "")
            if href and not href.startswith("#") and not href.startswith("javascript:"):
                # Make absolute URL
                if href.startswith("/"):
                    href = base_url.rstrip("/") + href
                elif not href.startswith("http"):
                    href = urljoin(base_url, href)
                # Return as markdown link
                link_text = children_text.strip()
                if link_text:
                    return f" {link_text} ({href}) "
            return children_text

        elif tag_name == "br":
            return "\n"

        elif tag_name in ["p", "div"]:
            return f"\n\n{children_text.strip()}\n\n"

        elif tag_name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
            return f"\n\n**{children_text.strip()}**\n\n"

        elif tag_name in ["ul", "ol"]:
            return f"\n{children_text}\n"

        elif tag_name == "li":
            return f"\n• {children_text.strip()}"

        elif tag_name in ["strong", "b"]:
            return f"**{children_text}**"

        elif tag_name in ["em", "i"]:
            return f"*{children_text}*"

        elif tag_name == "sup":
            return f"^{children_text}^"

        elif tag_name == "sub":
            return f"_{children_text}_"

        elif tag_name == "span":
            return children_text

        elif tag_name == "table":
            return f"\n\n[TABLE]\n{children_text}\n[/TABLE]\n\n"

        elif tag_name == "tr":
            return f"{children_text}\n"

        elif tag_name in ["td", "th"]:
            return f" | {children_text.strip()} "

        else:
            return children_text

    result = process_node(elem)

    # Clean up the result
    # Add space before paragraph markers like (1), (a), (i), (A), etc.
    result = re.sub(r"([^\s\n])(\([a-zA-Z0-9]+\))", r"\1 \2", result)
    # Add space after paragraph markers before text
    result = re.sub(r"(\([a-zA-Z0-9]+\))([A-Za-z])", r"\1 \2", result)

    # Clean up multiple newlines
    result = re.sub(r"\n{3,}", "\n\n", result)
    # Clean up multiple spaces
    result = re.sub(r" {2,}", " ", result)
    # Clean up spaces around newlines
    result = re.sub(r" *\n *", "\n", result)

    return clean_text(result.strip())


def _parse_aim_section_links(links, base_url: str) -> dict:
    chapters = {}

    for link in links:
        href = link.get("href", "")
        parsed_href = urlsplit(href)
        match = re.search(
            r"(?:^|/)chap_?(\d+)_section_\d+\.html$",
            parsed_href.path,
            re.IGNORECASE,
        )
        if not match or not re.fullmatch(r"\d+-\d+-\d+", parsed_href.fragment):
            continue

        chapter_num = int(match.group(1))
        section_id = parsed_href.fragment
        title = re.sub(
            rf"^{re.escape(section_id)}[.:]?\s*",
            "",
            link.get_text(" ", strip=True),
        )
        chapter = chapters.setdefault(
            chapter_num,
            {
                "chapter": chapter_num,
                "title": get_chapter_title(chapter_num),
                "sections": [],
            },
        )
        if not any(item["section"] == section_id for item in chapter["sections"]):
            chapter["sections"].append(
                {
                    "section": section_id,
                    "title": clean_text(title, is_title=True),
                    "url": urljoin(base_url, href.split("#", 1)[0]),
                }
            )

    return chapters


def parse_aim_index(html: str) -> dict:
    """Parse direct paragraph-list section links from the AIM index."""
    soup = BeautifulSoup(html, "lxml")
    return _parse_aim_section_links(soup.select(".paragraph-list a[href]"), AIM_INDEX_URL)


def parse_aim_chapter_links(html: str, base_url: str = AIM_INDEX_URL) -> dict[int, str]:
    """Parse chapter overview links from the AIM publication index."""
    soup = BeautifulSoup(html, "lxml")
    chapter_pages = {}
    for link in soup.select("a[href]"):
        href = link.get("href", "")
        path = urlsplit(href).path
        match = re.search(r"(?:^|/)chap_?(\d+)\.html$", path, re.IGNORECASE)
        if match:
            chapter_pages.setdefault(int(match.group(1)), urljoin(base_url, href.split("#", 1)[0]))
    return chapter_pages


def parse_aim_chapter_overview(html: str, base_url: str = AIM_INDEX_URL) -> dict:
    """Parse section links from a chapter overview page."""
    soup = BeautifulSoup(html, "lxml")
    return _parse_aim_section_links(soup.select("a[href]"), base_url)


def parse_aim_supplement_links(html: str, base_url: str = AIM_INDEX_URL) -> list[dict]:
    """Parse Chapter 0 change notes and AIM appendix links."""
    soup = BeautifulSoup(html, "lxml")
    supplements = {}
    for link in soup.select("a[href]"):
        href = link.get("href", "")
        path = urlsplit(href).path
        filename = Path(path).name.lower()
        if filename == "chap0_section_0.html":
            identifier = "0-0-1"
            title = "Explanation of Changes"
        else:
            match = re.fullmatch(r"appendix_(\d+)\.html", filename)
            if not match:
                continue
            identifier = f"A-{match.group(1)}"
            title = f"Appendix {match.group(1)}"
        supplements.setdefault(
            identifier,
            {
                "section": identifier,
                "title": title,
                "url": urljoin(base_url, href.split("#", 1)[0]),
            },
        )
    return sorted(supplements.values(), key=lambda item: item["section"])


def get_chapter_title(chapter_num: int) -> str:
    """Get the standard AIM chapter title."""
    titles = {
        0: "General Information and Appendices",
        1: "Air Navigation",
        2: "Aeronautical Lighting and Other Airport Visual Aids",
        3: "Airspace",
        4: "Air Traffic Control",
        5: "Air Traffic Procedures",
        6: "Emergency Procedures",
        7: "Safety of Flight",
        8: "Medical Facts for Pilots",
        9: "Aeronautical Charts and Related Publications",
        10: "Helicopter Operations",
        11: "Unmanned Aircraft Systems (UAS)",
    }
    return titles.get(chapter_num, f"Chapter {chapter_num}")


def extract_official_section(soup: BeautifulSoup, section_id: str) -> tuple[Tag | None, Tag | None]:
    title = soup.find(id=section_id, class_="paragraph-title")
    if not isinstance(title, Tag):
        return None, None

    fragment_soup = BeautifulSoup("<div></div>", "lxml")
    fragment = fragment_soup.div
    if fragment is None:
        return title, None

    for sibling in title.next_siblings:
        if isinstance(sibling, Tag) and sibling.name in {"h1", "h2", "h3", "h4"}:
            break
        fragment.append(copy(sibling))

    return title, fragment


def repair_hand_signal_sources(soup: BeautifulSoup, section_id: str, resolver) -> None:
    """Repair the known reused source image using the FAA's distinct AIM figures."""
    if section_id != "6-5-3":
        return
    for image in soup.find_all("img"):
        if Path(urlsplit(image.get("src", "")).path).name != "aim0605_fig197_recovered.svg":
            continue
        require_verified_asset_repairs(resolver)
        label = image.get("alt", "")
        if label not in HAND_SIGNAL_FIGURES:
            raise ValueError(f"Unknown label on duplicated FAA hand-signal figure: {label}")
        figure_id, filename = HAND_SIGNAL_FIGURES[label]
        image["data-source-image-url"] = urljoin(BASE_URL, image.get("src", ""))
        image["src"] = (
            "https://www.faa.gov/air_traffic/publications/aim_html/assets/img/" + filename
        )
        figure = image.find_parent("figure")
        caption = figure.find("figcaption") if figure else None
        if caption:
            caption.clear()
            caption.append(f"FIG {figure_id} {label}")


def reconcile_figure_captions(content: Tag, section_id: str, section_url: str, resolver) -> None:
    for image in content.find_all("img"):
        figure = image.find_parent("figure")
        caption = figure.find("figcaption") if figure else None
        if caption is None:
            continue
        title = caption.select_one(".fig-title")
        title_text = title.get_text(" ", strip=True) if title else ""
        if not title_text:
            title_text = caption.get_text(" ", strip=True)
            numbered = re.match(r"^(?:FIG|TBL)\s+\d+-\d+-\d+[:.\s]+(.+)$", title_text)
            if numbered:
                title_text = numbered.group(1)
        image_url = urljoin(section_url, image.get("src", ""))
        if Path(urlsplit(image_url).path).name in BROKEN_FIGURE_FILENAMES:
            require_verified_asset_repairs(resolver)
            verified = resolver.resolve_mirror_asset(section_id, title_text, image_url, section_url)
            if not verified.asset_url:
                raise ValueError(f"No verified replacement for broken FAA figure: {image_url}")
            image["data-source-image-url"] = image_url
            image["src"] = verified.asset_url
        else:
            verified = resolver.resolve(section_id, title_text, image_url, section_url)
        caption.clear()
        caption.append(verified.caption)
        image["data-pdf-number"] = verified.number
        image["data-pdf-kind"] = verified.kind
        image["data-pdf-page"] = str(verified.page)
        image["alt"] = verified.title or verified.label


def parse_aim_section(
    html: str, section_id: str, section_url: str, chapter_num: int, figure_resolver=None
) -> dict:
    """Parse an individual AIM section page and download images."""
    soup = BeautifulSoup(html, "lxml")
    repair_hand_signal_sources(soup, section_id, figure_resolver)

    section_data = {
        "section": section_id,
        "title": "",
        "content": "",
        "subsections": [],
        "figures": [],
        "tables": [],
    }

    official_title, official_content = extract_official_section(soup, section_id)
    if chapter_num != 0 and re.fullmatch(r"\d+-\d+-\d+", section_id) and official_title is None:
        raise ValueError(f"AIM section {section_id} is missing its official paragraph heading")

    # Remove navigation, header, footer elements first
    for tag in soup.find_all(["nav", "header", "footer", "script", "style", "noscript"]):
        tag.decompose()

    # Remove navigation links (PREV/NEXT, etc.)
    # Only remove link elements themselves, NOT their parent paragraphs
    # (parent paragraphs may contain legitimate content alongside nav links)
    for a in soup.find_all("a"):
        text = a.get_text(strip=True).lower()
        # Only exact match on standalone nav link text
        if text in ["prev", "next", "index", ".txt", ".pdf"]:
            # Check if the parent element is ONLY navigation (no real content)
            parent = a.parent
            if parent and parent.name in ["p", "div", "span"]:
                parent_text = parent.get_text(strip=True)
                # Remove parent only if it's purely navigation chrome
                # (e.g. "← PREV.txt.pdfAIM Page 321NEXT →")
                if (
                    len(parent_text) < 80
                    and any(nav in parent_text.lower() for nav in ["prev", "next"])
                    and "aim page" in parent_text.lower()
                ):
                    parent.decompose()
                    continue
            # Otherwise just remove the link itself
            a.decompose()

    # Find section title - look for heading with section number pattern
    title_elem = official_title
    if title_elem is None:
        for h in soup.find_all(["h1", "h2", "h3", "h4"]):
            text = h.get_text(strip=True)
            if re.match(r"\d+-\d+-\d+", text) or section_id in text:
                title_elem = h
                break

    if not title_elem:
        title_elem = soup.find("h1") or soup.find("h2") or soup.find("h3")

    if title_elem:
        title_text = title_elem.get_text(strip=True)
        # Clean up title - remove "AIM" prefix and section number (e.g. "AIM 3-1-1: General")
        title_clean = re.sub(r"^(AIM\s+)?\d+[−\-–—.]+\d+[−\-–—.]+\d+[.:;]?\s*", "", title_text)
        title_clean = re.sub(r"[.]+\s*\d+[−\-–—]\d+[−\-–—]\d+$", "", title_clean)
        section_data["title"] = clean_text(title_clean.strip(), is_title=True)

    # Find main content - try specific content containers first
    main_content = official_content or (
        soup.find("div", class_="content")
        or soup.find("div", class_="section-content")
        or soup.find("article")
        or soup.find("main")
        or soup.find("div", id="content")
    )

    # If no container found, use body but filter heavily
    if not main_content:
        main_content = soup.body

    image_scope = None
    if main_content:
        for image in main_content.find_all("img"):
            if Path(urlsplit(image.get("src", "")).path).name in LAYOUT_IMAGE_FILENAMES:
                image.decompose()
        if figure_resolver is not None:
            reconcile_figure_captions(main_content, section_id, section_url, figure_resolver)
        # Remove only actual site navigation/chrome elements
        # Be very specific — DO NOT remove content containing common words
        # like "search", "contact", "prev" which appear in aviation text
        for elem in main_content.find_all(["div", "p", "span"]):
            text = elem.get_text(strip=True)
            text_lower = text.lower()
            # Only remove elements that are clearly site navigation, not content
            if len(text) < 100 and (
                ("faraim.org" in text_lower or "far/aim.org" in text_lower)
                or (text_lower in ("aim index", "index", "about", "contact"))
                or re.match(r"^[←→â\s]*(PREV|NEXT)[←→â\s]*\.txt\.pdf.*$", text, re.I)
            ):
                elem.decompose()

        image_scope = copy(main_content)
        tables = main_content.find_all("table")
        for table in tables:
            table_data = extract_table(table)
            if table_data:
                section_data["tables"].append(table_data)
            table.decompose()

        section_data["content"] = clean_html_content(main_content, section_url)

        # Clean up any remaining navigation/chrome text
        content = section_data["content"]
        # Remove URLs in parentheses that are navigation
        content = re.sub(r"\s*\([^)]*faraim\.org[^)]*\)\s*", " ", content)
        content = re.sub(r"\s*\([^)]*index\.html[^)]*\)\s*", " ", content)
        # Remove standalone navigation words (only when they appear as nav chrome)
        content = re.sub(r"â\s*PREV\b", "", content)
        content = re.sub(r"\bNEXT\s*â", "", content)
        # Remove page number markers like "AIM Page 321"
        content = re.sub(r"\bAIM\s+Page\s+\d+\b", "", content)
        # Remove trailing section references from other pages
        # (e.g. "11-8-4 Other Information and Best Practices" at end of 11-8-7)
        content = re.sub(r"\n\n\d+-\d+-\d+\s+[A-Z].*$", "", content, flags=re.DOTALL)
        # Remove AIM date stamps (e.g. "AIM 2/20/25", "2/20/25 AIM") with or without bold
        content = re.sub(r"\*?\*?AIM\s*\d+/\d+/\d+\*?\*?", "", content)
        content = re.sub(r"\*?\*?\d+/\d+/\d+\s*AIM\*?\*?", "", content)
        content = re.sub(r"\*?\*?AIM\d+/\d+/?\*?\*?", "", content)
        # Remove redundant header at start ("**AIM X-Y-Z: Title**\n\n**X-Y-Z. Title**")
        content = re.sub(r"^\*\*AIM\s+\d+-\d+-\d+[:.][^*]*\*\*\s*\n*", "", content)
        content = re.sub(r"^\*\*\d+-\d+-\d+[.][^*]*\*\*\s*\n*", "", content)
        # Remove page break markers ("Section Name X-Y-Z\n****")
        content = re.sub(
            r"\n\n[A-Z][A-Za-z /\-\(\)]+\s+\d+-\d+-\d+\s*\n\n\*{3,}\n*", "\n\n", content
        )
        content = re.sub(r"\n\n[A-Z][A-Za-z /\-\(\)]+\s*\d+-\d+-\d+\s*$", "", content)
        # Remove standalone "****" markers
        content = re.sub(r"\n\n\*{3,}\s*", "\n\n", content)
        # Remove trailing "Section X. Title" or "Chapter X. Title" leaked from next page
        content = re.sub(r"\n\nSection\s+\d+\.\s+[A-Z].*$", "", content, flags=re.DOTALL)
        content = re.sub(r"\n\nChapter\s+\d+\.\s+[A-Z].*$", "", content, flags=re.DOTALL)
        # Remove unicode artifacts
        content = re.sub(r"â\s*â", "", content)
        # Clean up whitespace
        content = re.sub(r"\n{3,}", "\n\n", content)
        content = re.sub(r" {2,}", " ", content)
        section_data["content"] = clean_text(content.strip())

    # Find and download images
    base_url = section_url.rsplit("/", 1)[0] + "/"  # Get directory URL

    images = image_scope.find_all("img") if image_scope is not None else []
    for image_index, img in enumerate(images, start=1):
        src = img.get("src", "")
        alt = img.get("alt", "Figure")

        if src:
            # Construct full image URL
            if not src.startswith("http"):
                img_url = urljoin(base_url, src)
            else:
                img_url = src

            figure = img.find_parent("figure")
            figcaption = figure.find("figcaption") if figure else None
            caption = figcaption.get_text(" ", strip=True) if figcaption else img.get("title", "")
            # Local path for the image
            suffix = Path(urlsplit(img_url).path).suffix.lower() or ".png"
            if suffix in {".svg", ".webp"}:
                suffix = ".png"
            img_filename = f"section-{section_id}-img-{image_index}{suffix}"
            local_img_path = f"chapter{chapter_num}/{img_filename}"
            full_save_path = IMAGES_DIR / f"chapter{chapter_num}" / img_filename

            download_image(img_url, full_save_path)
            figure_data = {
                "src": local_img_path,
                "alt": alt,
                "caption": clean_text(caption),
                "originalUrl": img_url,
            }
            if img.get("data-pdf-number"):
                figure_data.update(
                    {
                        "number": img["data-pdf-number"],
                        "kind": img["data-pdf-kind"],
                        "sourcePdfPage": int(img["data-pdf-page"]),
                    }
                )
            if img.get("data-source-image-url"):
                figure_data["sourceImageUrl"] = img["data-source-image-url"]
            section_data["figures"].append(figure_data)

    if not section_data["title"] or not any(
        section_data[field] for field in ("content", "figures", "tables")
    ):
        raise ValueError(f"AIM section {section_id} has no title or usable content")
    return section_data


def extract_table(table_elem) -> dict | None:
    """Extract table data from a table element."""

    def span(cell: Tag, attribute: str) -> int:
        try:
            return max(int(cell.get(attribute, 1) or 1), 1)
        except (TypeError, ValueError):
            return 1

    caption_elem = table_elem.find("caption")
    caption = caption_elem.get_text(" ", strip=True) if caption_elem else ""
    if not caption:
        caption = table_elem.get("title", "") or table_elem.get("aria-label", "")

    source_rows = [
        row for row in table_elem.find_all("tr") if row.find_parent("table") is table_elem
    ]
    grid: dict[tuple[int, int], str] = {}
    for row_index, row in enumerate(source_rows):
        column_index = 0
        for cell in row.find_all(["th", "td"], recursive=False):
            while (row_index, column_index) in grid:
                column_index += 1
            value = clean_text(cell.get_text(" ", strip=True))
            rowspan = span(cell, "rowspan")
            colspan = span(cell, "colspan")
            for row_offset in range(rowspan):
                for column_offset in range(colspan):
                    grid[(row_index + row_offset, column_index + column_offset)] = value
            column_index += colspan

    if not grid:
        return None

    width = max(column for _, column in grid) + 1
    height = max(row for row, _ in grid) + 1
    matrix = [[grid.get((row, column), "") for column in range(width)] for row in range(height)]

    thead = table_elem.find("thead")
    if thead:
        header_row_count = len(
            [row for row in thead.find_all("tr") if row.find_parent("table") is table_elem]
        )
    else:
        header_row_count = 0
        for row in source_rows:
            if row.find("th", recursive=False):
                header_row_count += 1
            else:
                break
    header_rows = matrix[:header_row_count]
    headers = []
    for column in range(width):
        labels = []
        for row in header_rows:
            value = row[column]
            if value and value not in labels:
                labels.append(value)
        headers.append(" / ".join(labels))
    rows = matrix[header_row_count:]

    if rows:
        table_data = {"headers": headers, "rows": rows}
        if caption:
            table_data["caption"] = clean_text(caption)
        return table_data
    return None


def extract_effective_date(html: str) -> str:
    text = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
    match = re.search(r"Effective:\s*(\d{1,2})/(\d{1,2})/(\d{2,4})", text, re.IGNORECASE)
    if not match:
        raise ValueError("FAA AIM effective date not found")

    month, day, year = match.groups()
    if len(year) == 2:
        year = f"20{year}"
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def remove_unused_images(chapters: list[dict]) -> None:
    referenced = {
        figure["src"]
        for chapter in chapters
        for section in chapter["sections"]
        for figure in section.get("figures", [])
    }
    for path in IMAGES_DIR.glob("chapter*/*"):
        relative = path.relative_to(IMAGES_DIR).as_posix()
        if path.is_file() and relative not in referenced:
            path.unlink()
    for directory in sorted(IMAGES_DIR.glob("chapter*"), reverse=True):
        if directory.is_dir() and not any(directory.iterdir()):
            shutil.rmtree(directory)


def main():
    """Main function to crawl AIM."""
    print("AIM Crawler - Downloading Aeronautical Information Manual")
    print("=" * 60)

    # Create output directories
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    # Fetch index page
    print(f"\nFetching AIM index from {AIM_INDEX_URL}")
    index_html = fetch_page(AIM_INDEX_URL)

    if not index_html:
        print("ERROR: Could not fetch AIM index page")
        sys.exit(1)

    effective_date = extract_effective_date(index_html)

    chapters = parse_aim_index(index_html)
    chapter_pages = parse_aim_chapter_links(index_html)
    index_supplements = parse_aim_supplement_links(index_html)
    if index_supplements:
        chapters[0] = {
            "chapter": 0,
            "title": get_chapter_title(0),
            "sections": index_supplements,
        }
    for chapter_num, chapter_url in sorted(chapter_pages.items()):
        chapter_html = fetch_page(chapter_url)
        if not chapter_html:
            print(f"ERROR: Could not fetch AIM chapter {chapter_num} overview")
            sys.exit(1)
        if chapter_num == 0:
            supplement_links = list(index_supplements)
            supplement_links.extend(parse_aim_supplement_links(chapter_html, chapter_url))
            chapters[0] = {
                "chapter": 0,
                "title": get_chapter_title(0),
                "sections": list({item["section"]: item for item in supplement_links}.values()),
            }
        else:
            overview = parse_aim_chapter_overview(chapter_html, chapter_url)
            if not overview.get(chapter_num, {}).get("sections"):
                raise ValueError(f"AIM chapter {chapter_num} overview contains no paragraph links")
            combined = {
                item["section"]: item for item in chapters.get(chapter_num, {}).get("sections", [])
            }
            combined.update({item["section"]: item for item in overview[chapter_num]["sections"]})
            chapters[chapter_num] = {**overview[chapter_num], "sections": list(combined.values())}
        if not chapters.get(chapter_num, {}).get("sections"):
            raise ValueError(f"AIM chapter {chapter_num} contains no sections")
    if not chapters:
        raise ValueError("FAA AIM index contains no chapters or sections")
    print(f"Found {len(chapters)} AIM chapters")

    total_sections = sum(len(c["sections"]) for c in chapters.values())
    print(f"Total sections to download: {total_sections}")

    for ch_num, ch_data in sorted(chapters.items()):
        print(f"  Chapter {ch_num}: {ch_data['title']} ({len(ch_data['sections'])} sections)")

    # Process each chapter
    all_chapters = []
    chapter_documents = []
    figure_resolver = None
    total_images = 0

    for chapter_num in tqdm(sorted(chapters.keys()), desc="Processing AIM chapters"):
        chapter_data = chapters[chapter_num]
        print(f"\n\nProcessing Chapter {chapter_num}: {chapter_data['title']}")

        full_chapter = {"chapter": chapter_num, "title": chapter_data["title"], "sections": []}

        chapter_images = 0

        for section_info in tqdm(chapter_data["sections"], desc=f"  Ch.{chapter_num}", leave=False):
            section_html = fetch_page(section_info["url"])
            if not section_html:
                raise RuntimeError(
                    f"Could not fetch AIM section {section_info['section']}: "
                    f"{section_info['url']}"
                )

            if chapter_num > 0 and "<figcaption" in section_html and figure_resolver is None:
                figure_resolver = load_figure_resolver(effective_date)

            section_data = parse_aim_section(
                section_html,
                section_info["section"],
                section_info["url"],
                chapter_num,
                figure_resolver=figure_resolver if chapter_num > 0 else None,
            )
            if not section_data["title"] and section_info.get("title"):
                section_data["title"] = clean_text(section_info["title"], is_title=True)

            chapter_images += len(section_data.get("figures", []))
            full_chapter["sections"].append(section_data)

        total_images += chapter_images
        print(f"  Downloaded {chapter_images} images for chapter {chapter_num}")

        chapter_documents.append(full_chapter)

        all_chapters.append(
            {
                "chapter": chapter_num,
                "title": chapter_data["title"],
                "file": f"aim/chapter{chapter_num}.json",
                "sectionCount": len(full_chapter["sections"]),
                "imageCount": chapter_images,
            }
        )

    # Do not publish partially refreshed chapter data if any required section or figure failed.
    for chapter in chapter_documents:
        chapter_file = DATA_DIR / f"chapter{chapter['chapter']}.json"
        with open(chapter_file, "w", encoding="utf-8") as f:
            json.dump(chapter, f, indent=2, ensure_ascii=False)
        print(f"  Saved {chapter_file}")
    remove_unused_images(chapter_documents)

    # Create index file
    index_data = {
        "title": "Aeronautical Information Manual (AIM)",
        "description": "Official guide to basic flight information and ATC procedures",
        "lastUpdated": effective_date,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "edition": {"effectiveDate": effective_date},
        "source": "Federal Aviation Administration",
        "totalSections": total_sections,
        "totalImages": total_images,
        "chapters": all_chapters,
    }
    change_match = re.search(
        r"\bChange:\s*(Change\s+\d+|Basic)",
        BeautifulSoup(index_html, "lxml").get_text(" ", strip=True),
    )
    if change_match:
        index_data["edition"]["change"] = change_match.group(1)
    if figure_resolver is not None:
        index_data["figureSource"] = figure_resolver.catalog.provenance

    index_file = DATA_DIR / "index.json"
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(index_data, f, indent=2, ensure_ascii=False)
    print(f"\nSaved AIM index to {index_file}")

    print(f"\n{'=' * 60}")
    print("Crawl complete!")
    print(f"  Chapters: {len(all_chapters)}")
    print(f"  Sections: {total_sections}")
    print(f"  Images: {total_images}")
    print(f"Data saved to {DATA_DIR}")


if __name__ == "__main__":
    main()
