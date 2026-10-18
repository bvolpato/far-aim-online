#!/usr/bin/env python3
"""
Crawl FAR (Federal Aviation Regulations) from eCFR (official source).
Downloads all FAR parts with proper content formatting.
"""

import json
import re
import time
import zipfile
from functools import cache
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup, NavigableString, Tag
from lxml import etree
from PIL import Image, UnidentifiedImageError
from tqdm import tqdm

from clean_data import clean_text
from ecfr import ECFR_VERSIONS_URL, TITLE_49_PARTS, latest_ecfr_issue_date

# Base URLs
ECFR_BASE = "https://www.ecfr.gov"
ECFR_API = "https://www.ecfr.gov/api/versioner/v1/full"

# Output directory
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data" / "far"
IMAGES_DIR = SCRIPT_DIR.parent / "web" / "public" / "far" / "images"

# Request settings
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FARAIMPro/1.0; Educational Aviation App)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
REQUEST_DELAY = 0.5


def fetch_page(url: str, retries: int = 3) -> str | None:
    """Fetch a page with retries and delay."""
    for attempt in range(retries):
        try:
            time.sleep(REQUEST_DELAY)
            response = requests.get(url, headers=HEADERS, timeout=60)
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            if attempt < retries - 1:
                print(f"  Retry {attempt + 1} for {url}: {e}")
                time.sleep(2**attempt)
            else:
                print(f"  Failed to fetch {url}: {e}")
    return None


def parse_cfr_link(href: str) -> dict | None:
    """
    Parse a CFR link and extract navigation info.
    Returns dict with type ('part' or 'section') and identifiers.
    """
    if not href:
        return None

    # Parse eCFR links: /current/title-14/part-61, /current/title-14/section-61.1
    # Also handles anchors like #p-61.1(a)

    # Section link: title-14/section-61.1 or title-14/part-61/section-61.1
    section_match = re.search(r"title-(\d+).*?section-(\d+\.\d+[a-z]?)", href)
    if section_match:
        return {
            "type": "section",
            "title": int(section_match.group(1)),
            "section": section_match.group(2),
            "part": int(section_match.group(2).split(".")[0]),
        }

    # Part link: title-14/part-61
    part_match = re.search(r"title-(\d+)/part-(\d+)", href)
    if part_match:
        return {"type": "part", "title": int(part_match.group(1)), "part": int(part_match.group(2))}

    return None


def format_link_text(link_info: dict, link_text: str) -> str:
    """
    Format a CFR link as readable text with navigation hint.
    For internal FAR links, we'll use a special format the app can parse.
    """
    if not link_info:
        return link_text

    # For Title 14 (aviation regs), format as navigable reference
    if link_info["title"] == 14:
        if link_info["type"] == "section":
            # Format: "§ 61.1" or keep original text if it's descriptive
            if re.match(r"^§?\s*\d+\.\d+", link_text):
                return f"§ {link_info['section']}"
            else:
                return f"{link_text} (§ {link_info['section']})"
        elif link_info["type"] == "part":
            if re.match(r"^[Pp]art\s+\d+", link_text):
                return f"Part {link_info['part']}"
            else:
                return f"{link_text} (Part {link_info['part']})"

    # For Title 49 (NTSB, etc.)
    elif link_info["title"] == 49:
        if link_info["type"] == "section":
            return f"{link_text} (49 CFR {link_info['section']})"
        elif link_info["type"] == "part":
            return f"{link_text} (49 CFR Part {link_info['part']})"

    return link_text


def clean_html_content(elem: Tag, base_url: str = "") -> str:
    """
    Convert HTML element to clean, readable text.
    - Converts CFR links to readable references
    - Removes markdown-style formatting (no *bold*, just text)
    - Preserves paragraph structure
    - Fixes spacing around markers like (1), (a), (i)
    """
    if elem is None:
        return ""

    # Remove scripts, styles, and other unwanted elements
    for tag in elem.find_all(["script", "style", "noscript", "iframe"]):
        tag.decompose()

    def format_table(table: Tag) -> str:
        source_rows = [
            row
            for row in table.find_all(lambda tag: tag.name and tag.name.lower() == "tr")
            if row.find_parent(lambda tag: tag.name and tag.name.lower() == "table") is table
        ]
        grid: list[dict[int, str]] = []
        spans: dict[int, tuple[int, str]] = {}
        header_count = 0
        for row_index, row in enumerate(source_rows):
            values = {column: value for column, (end, value) in spans.items() if end > row_index}
            cells = row.find_all(
                lambda tag: tag.name and tag.name.lower() in {"td", "th"}, recursive=False
            )
            if row.find_parent(lambda tag: tag.name and tag.name.lower() == "thead"):
                header_count += 1
            column = 0
            for cell in cells:
                while column in values:
                    column += 1
                text = "".join(process_node(child) for child in cell.children)
                text = re.sub(r"-\s*\n\s*(?=\w)", "-", text)
                text = " ".join(text.split()).replace("|", r"\|")
                colspan = max(1, int(cell.get("colspan", "1")))
                rowspan = int(cell.get("rowspan", "1")) or len(source_rows) - row_index
                for offset in range(colspan):
                    values[column + offset] = text
                    if rowspan > 1:
                        spans[column + offset] = (row_index + rowspan, text)
                column += colspan
            if values:
                grid.append(values)

        if not grid:
            return "".join(process_node(child) for child in table.children)
        width = max(max(row) for row in grid) + 1
        # Combine stacked/spanned headings so every serialized column keeps its
        # full label, including in segregation matrices with empty data cells.
        header_count = max(1, header_count)
        headers = [
            " / ".join(
                dict.fromkeys(row.get(column, "") for row in grid[:header_count] if row.get(column))
            )
            for column in range(width)
        ]
        rows = [headers] + [
            [row.get(column, "") for column in range(width)] for row in grid[header_count:]
        ]
        body = "\n\n".join(f"| {' | '.join(row)} |" for row in rows)
        caption = table.find(
            lambda tag: tag.name and tag.name.lower() == "caption", recursive=False
        )
        caption_text = (
            " ".join("".join(process_node(child) for child in caption.children).split())
            if caption
            else ""
        )
        prefix = f"{caption_text}\n\n" if caption_text else ""
        return f"\n\n{prefix}[TABLE]\n{body}\n[/TABLE]\n\n"

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

        if tag_name == "table":
            return format_table(node)

        # Process children first
        children_text = ""
        for child in node.children:
            children_text += process_node(child, depth + 1)

        # Handle specific tags
        if tag_name == "a":
            href = node.get("href", "")
            link_text = children_text.strip()

            if href and not href.startswith("#") and not href.startswith("javascript:"):
                # Make absolute URL for parsing
                if href.startswith("/"):
                    full_href = ECFR_BASE + href
                elif not href.startswith("http"):
                    full_href = urljoin(base_url, href)
                else:
                    full_href = href

                # Check if it's a CFR link we can parse
                link_info = parse_cfr_link(full_href)
                if link_info:
                    return format_link_text(link_info, link_text)

                # For external links (USC, govinfo), just use the text
                # Don't include URL in output
                return link_text

            return link_text

        elif tag_name == "br":
            return "\n"

        elif tag_name in ["p", "div"]:
            stripped = children_text.strip()
            if stripped:
                return f"\n\n{stripped}\n\n"
            return ""

        elif tag_name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
            stripped = children_text.strip()
            if stripped:
                return f"\n\n{stripped}\n\n"
            return ""

        elif tag_name in ["ul", "ol"]:
            return f"\n{children_text}\n"

        elif tag_name == "li":
            stripped = children_text.strip()
            if stripped:
                return f"\n• {stripped}"
            return ""

        elif tag_name in ["strong", "b"]:
            # Wrap in ** for bold
            stripped = children_text.strip()
            if stripped:
                return f"**{stripped}**"
            return children_text

        elif tag_name in ["em", "i"]:
            # Wrap in * for italic
            stripped = children_text.strip()
            if stripped:
                return f"*{stripped}*"
            return children_text

        elif tag_name == "sup":
            return children_text

        elif tag_name == "sub":
            return children_text

        elif tag_name == "span":
            return children_text

        elif tag_name == "cita":
            return f"\n\n{' '.join(children_text.split())}\n\n"

        elif tag_name == "tr":
            return f"{children_text}\n"

        elif tag_name in ["td", "th"]:
            stripped = children_text.strip()
            return f" | {stripped} " if stripped else ""

        else:
            return children_text

    result = process_node(elem)

    # Clean up the result

    # Fix paragraph markers that have spaces inside: ( 1 ) -> (1)
    result = re.sub(r"\(\s*([a-zA-Z0-9]+)\s*\)", r"(\1)", result)

    # Add space before paragraph markers like (1), (a), (i) if needed
    result = re.sub(r"([^\s\n(])(\([a-zA-Z0-9]+\))", r"\1 \2", result)

    # Add space after paragraph markers before letters (but not before more parens)
    result = re.sub(r"(\([a-zA-Z0-9]+\))([A-Za-z])", r"\1 \2", result)

    # Clean up multiple newlines (max 2)
    result = re.sub(r"\n{3,}", "\n\n", result)

    # Clean up multiple spaces
    result = re.sub(r"[ \t]{2,}", " ", result)

    # Clean up spaces at start/end of lines
    result = re.sub(r"[ \t]+\n", "\n", result)
    result = re.sub(r"\n[ \t]+", "\n", result)

    return clean_text(result.strip())


def get_ecfr_toc(title: int = 14) -> list[dict]:
    """Get table of contents for a CFR title from eCFR."""
    # Use the structure endpoint
    url = f"{ECFR_BASE}/api/versioner/v1/structure/current/title-{title}.json"

    time.sleep(REQUEST_DELAY)
    response = requests.get(url, headers=HEADERS, timeout=60)
    response.raise_for_status()
    data = response.json()

    parts = []

    def extract_parts(node, subchapter="", subchapter_title=""):
        if node.get("type") == "subchapter":
            subchapter = node.get("identifier", "")
            subchapter_title = (
                node.get("label", "").replace(f"Subchapter {subchapter}", "").strip(" -–—:")
            )

        if node.get("type") == "part":
            part_num = node.get("identifier", "")
            if part_num.isdigit():
                parts.append(
                    {
                        "part": int(part_num),
                        "title": node.get("label", "")
                        .replace(f"Part {part_num}", "")
                        .strip(" -–—:"),
                        "subchapter": subchapter,
                        "subchapterTitle": subchapter_title,
                        "cfr_title": str(title),
                    }
                )

        for child in node.get("children", []):
            extract_parts(child, subchapter, subchapter_title)

    extract_parts(data)
    if not parts:
        raise ValueError(f"eCFR table of contents has no parts for Title {title}")
    return parts


def get_latest_ecfr_date(title: int) -> str:
    """Return latest published eCFR content date for a title."""
    url = ECFR_VERSIONS_URL.format(title=title)
    time.sleep(REQUEST_DELAY)
    response = requests.get(url, headers=HEADERS, timeout=60)
    response.raise_for_status()
    return latest_ecfr_issue_date(response.json())


def parse_ecfr_xml(xml_content: str) -> BeautifulSoup:
    """Reject malformed or truncated source XML before the tolerant HTML parser runs."""
    try:
        etree.fromstring(
            xml_content.encode("utf-8"),
            parser=etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=True),
        )
    except etree.XMLSyntaxError as error:
        raise ValueError(f"Invalid eCFR XML: {error}") from error
    return BeautifulSoup(xml_content, "xml")


def split_ecfr_title_xml(xml_content: str, part_numbers: set[int]) -> dict[int, str]:
    """Extract requested PART nodes from one official title XML response."""
    soup = parse_ecfr_xml(xml_content)
    parts = {}
    for root in soup.find_all(attrs={"TYPE": "PART"}):
        identifier = root.get("N", "").strip()
        if not identifier.isdigit() or int(identifier) not in part_numbers:
            continue
        part_number = int(identifier)
        if part_number in parts:
            raise ValueError(f"Duplicate Part {part_number} in eCFR title XML")
        parts[part_number] = str(root)
    missing = part_numbers - parts.keys()
    if missing:
        raise ValueError(f"Missing requested eCFR parts: {sorted(missing)}")
    return parts


def fetch_ecfr_title_parts(
    cfr_title: int, effective_date: str, part_numbers: set[int]
) -> dict[int, str]:
    """Fetch one title response to avoid hundreds of redundant API requests."""
    api_url = f"{ECFR_API}/{effective_date}/title-{cfr_title}.xml"
    xml_content = fetch_page(api_url)
    if not xml_content:
        raise RuntimeError(f"Could not fetch Title {cfr_title} eCFR XML")
    return split_ecfr_title_xml(xml_content, part_numbers)


def _image_is_valid(content: bytes) -> bool:
    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError):
        return False
    return True


def _federal_register_image_url(url: str) -> str | None:
    """Map an eCFR graphics URL to its downloadable Federal Register asset."""
    parsed = urlsplit(url)
    if parsed.hostname not in {"ecfr.gov", "www.ecfr.gov"}:
        return None
    path = Path(unquote(parsed.path))
    if len(path.parts) < 3 or path.parts[1].lower() != "graphics" or not path.suffix:
        return None
    return (
        f"https://images.federalregister.gov/{path.stem.upper()}" f"/original{path.suffix.lower()}"
    )


@cache
def _govinfo_graphics_archive(cfr_title: int) -> tuple[zipfile.ZipFile, dict[str, str]]:
    """Download official GPO eCFR graphics once per title."""
    url = (
        f"https://www.govinfo.gov/bulkdata/ECFR/title-{cfr_title}/"
        f"ECFR-title{cfr_title}-graphics.zip"
    )
    failures = []
    for attempt in range(3):
        try:
            time.sleep(REQUEST_DELAY)
            response = requests.get(url, headers=HEADERS, timeout=120)
            response.raise_for_status()
            archive = zipfile.ZipFile(BytesIO(response.content))
            if bad_member := archive.testzip():
                raise ValueError(f"corrupt ZIP member: {bad_member}")
            members = {}
            for member in archive.namelist():
                filename = Path(member).name.casefold()
                if not filename:
                    continue
                if filename in members and members[filename] != member:
                    raise ValueError(f"duplicate graphics filename: {filename}")
                members[filename] = member
            return archive, members
        except (requests.RequestException, ValueError, zipfile.BadZipFile) as error:
            failures.append(str(error))
            if attempt < 2:
                time.sleep(2**attempt)
    raise RuntimeError(f"Could not download GPO graphics archive {url}: {'; '.join(failures)}")


def _govinfo_image(cfr_title: int, url: str) -> bytes:
    archive, members = _govinfo_graphics_archive(cfr_title)
    filename = _image_filename(url).casefold()
    member = members.get(filename)
    if not member:
        raise FileNotFoundError(f"{filename} not found in Title {cfr_title} graphics archive")
    content = archive.read(member)
    if not _image_is_valid(content):
        raise ValueError(f"GPO archive member {member} was not a valid image")
    return content


def download_image(url: str, save_path: Path, cfr_title: int, retries: int = 3) -> None:
    """Download and validate an eCFR image without replacing good data with error HTML."""
    if save_path.is_file() and _image_is_valid(save_path.read_bytes()):
        return

    failures = []
    try:
        content = _govinfo_image(cfr_title, url)
        save_path.parent.mkdir(parents=True, exist_ok=True)
        save_path.write_bytes(content)
        return
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        failures.append(f"GPO Title {cfr_title} graphics archive: {error}")

    federal_register_url = _federal_register_image_url(url)
    candidates = [candidate for candidate in [federal_register_url, url] if candidate]
    for candidate in dict.fromkeys(candidates):
        for attempt in range(retries):
            try:
                time.sleep(REQUEST_DELAY)
                response = requests.get(candidate, headers=HEADERS, timeout=60)
                response.raise_for_status()
                if not _image_is_valid(response.content):
                    raise ValueError("response was not a valid image")
                save_path.parent.mkdir(parents=True, exist_ok=True)
                save_path.write_bytes(response.content)
                return
            except (requests.RequestException, ValueError) as error:
                failures.append(f"{candidate}: {error}")
                if attempt < retries - 1:
                    time.sleep(2**attempt)
    raise RuntimeError(f"Could not download eCFR image {url}: {'; '.join(failures)}")


def _direct_head_text(element: Tag) -> str:
    heads = element.find_all("HEAD", recursive=False)
    return clean_text(heads[-1].get_text(" ", strip=True), is_title=True) if heads else ""


def _image_url(src: str) -> str:
    if not src.strip():
        raise ValueError("Owned eCFR image has no src")
    url = urljoin(f"{ECFR_BASE}/", src.strip())
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(f"Unsupported eCFR image URL: {src}")
    if parsed.scheme == "http" and parsed.hostname in {"ecfr.gov", "www.ecfr.gov"}:
        parsed = parsed._replace(scheme="https")
        url = urlunsplit(parsed)
    return url


def _image_filename(url: str) -> str:
    filename = Path(unquote(urlsplit(url).path)).name
    filename = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip(".-")
    if not filename:
        return f"image-{sha256(url.encode()).hexdigest()[:12]}"
    return filename


def _nearest_image_owner(image: Tag) -> Tag | None:
    for parent in image.parents:
        if isinstance(parent, Tag) and parent.get("TYPE", "").upper() in {
            "SECTION",
            "APPENDIX",
        }:
            return parent
    return None


def _owned_xml_images(container: Tag) -> list[Tag]:
    return [
        image
        for image in container.find_all(lambda tag: tag.name and tag.name.lower() == "img")
        if _nearest_image_owner(image) is container
    ]


def _xml_image_paths(root: Tag, part_num: int) -> dict[str, str]:
    urls = {
        _image_url(image.get("src", ""))
        for image in root.find_all(lambda tag: tag.name and tag.name.lower() == "img")
        if _nearest_image_owner(image) is not None
    }
    urls_by_filename: dict[str, set[str]] = {}
    for url in urls:
        urls_by_filename.setdefault(_image_filename(url).casefold(), set()).add(url)

    paths = {}
    for url in urls:
        filename = _image_filename(url)
        if len(urls_by_filename[filename.casefold()]) > 1:
            path = Path(filename)
            filename = f"{path.stem}-{sha256(url.encode()).hexdigest()[:10]}{path.suffix}"
        paths[url] = f"part{part_num}/{filename}"
    return paths


def _adjacent_caption(element: Tag, previous: bool) -> str:
    siblings = element.previous_siblings if previous else element.next_siblings
    for sibling in siblings:
        if isinstance(sibling, NavigableString) and not str(sibling).strip():
            continue
        if isinstance(sibling, Tag) and sibling.name.lower() in {
            "caption",
            "figcaption",
            "figcap",
            "tcap",
        }:
            return clean_text(sibling.get_text(" ", strip=True))
        break
    return ""


def _xml_image_caption(image: Tag, owner: Tag) -> str:
    figure = image.find_parent(lambda tag: tag.name and tag.name.lower() == "figure")
    if isinstance(figure, Tag):
        caption = figure.find(
            lambda tag: tag.name and tag.name.lower() in {"caption", "figcaption", "figcap", "tcap"}
        )
        if isinstance(caption, Tag):
            text = clean_text(caption.get_text(" ", strip=True))
            if text:
                return text

    current = image
    while current is not owner:
        for previous in (True, False):
            caption = _adjacent_caption(current, previous)
            if caption:
                return caption
        parent = current.parent
        if not isinstance(parent, Tag):
            break
        current = parent
    return clean_text(image.get("title", ""))


def _xml_owner_label(owner: Tag) -> str:
    heading = _direct_head_text(owner)
    if heading:
        return heading
    identifier = owner.get("N", "").strip()
    if owner.get("TYPE", "").upper() == "SECTION":
        return f"§ {identifier}"
    return identifier or "FAR appendix"


def _extract_xml_figures(
    owner: Tag,
    image_paths: dict[str, str],
) -> list[dict]:
    figures = []
    owner_label = _xml_owner_label(owner)
    for image_index, image in enumerate(_owned_xml_images(owner), start=1):
        original_url = _image_url(image.get("src", ""))
        caption = _xml_image_caption(image, owner)
        alt = clean_text(image.get("alt", "")) or caption
        if not alt:
            is_equation = any(
                isinstance(parent, Tag) and parent.name.lower() == "math"
                for parent in image.parents
                if parent is not owner
            )
            kind = "Equation" if is_equation else "Figure"
            alt = f"{kind} {image_index} in {owner_label}"
        figures.append(
            {
                "src": image_paths[original_url],
                "alt": alt,
                "caption": caption,
                "originalUrl": original_url,
            }
        )
    return figures


def _xml_body_text(element: Tag) -> str:
    clone = BeautifulSoup(str(element), "xml").find()
    if not isinstance(clone, Tag):
        return ""
    head = clone.find("HEAD", recursive=False)
    if head:
        head.decompose()
    return clean_html_content(clone, ECFR_BASE)


def _parse_xml_section(element: Tag, image_paths: dict[str, str]) -> dict:
    section_id = element.get("N", "").strip()
    heading = _direct_head_text(element)
    title = re.sub(rf"^§\s*{re.escape(section_id)}\s*", "", heading).strip(" .-–—:")
    content = _xml_body_text(element)
    if "reserved" in title.lower():
        title = "[Reserved]"
        content = ""
    return {
        "section": section_id,
        "title": clean_text(title, is_title=True),
        "content": content,
        "figures": _extract_xml_figures(element, image_paths),
    }


def _owned_xml_elements(container: Tag, element_type: str) -> list[Tag]:
    """Return descendants whose nearest structural owner is container."""
    owned = []
    # The data model keeps every appendix at part level, including appendices
    # attached to a subpart. Their original identifier preserves that scope.
    structural_types = {"PART", "APPENDIX"}
    if element_type != "APPENDIX":
        structural_types.add("SUBPART")
    for element in container.find_all(attrs={"TYPE": element_type}):
        owner = next(
            (
                parent
                for parent in element.parents
                if isinstance(parent, Tag) and parent.get("TYPE") in structural_types
            ),
            None,
        )
        if owner is container:
            owned.append(element)
    return owned


def parse_ecfr_part_xml(
    xml_content: str,
    part_num: int,
    cfr_title: int,
    effective_date: str,
    part_info: dict | None = None,
) -> dict:
    """Parse official eCFR versioner XML without dropping appendices or suffixed sections."""
    soup = parse_ecfr_xml(xml_content)
    root = soup.find(attrs={"TYPE": "PART"})
    if not isinstance(root, Tag) or root.get("N") != str(part_num):
        raise ValueError(f"eCFR XML did not contain Title {cfr_title} Part {part_num}")

    heading = _direct_head_text(root)
    title = re.sub(rf"^PART\s+{part_num}\s*[—\-–:]\s*", "", heading, flags=re.I)
    website_url = f"{ECFR_BASE}/current/title-{cfr_title}/part-{part_num}"
    info = part_info or {}
    image_paths = _xml_image_paths(root, part_num)
    part_data = {
        "part": part_num,
        "title": clean_text(title or info.get("title", ""), is_title=True),
        "cfr": f"{cfr_title} CFR Part {part_num}",
        "source": "eCFR",
        "url": website_url,
        "subchapter": info.get("subchapter", ""),
        "subchapterTitle": info.get("subchapterTitle", ""),
        "effectiveDate": effective_date,
        "subparts": [],
        "sections": [],
        "appendices": [],
    }

    for section in _owned_xml_elements(root, "SECTION"):
        part_data["sections"].append(_parse_xml_section(section, image_paths))

    for subpart in _owned_xml_elements(root, "SUBPART"):
        subpart_id = subpart.get("N", "").strip()
        subpart_heading = _direct_head_text(subpart)
        subpart_title = re.sub(
            rf"^Subpart\s+{re.escape(subpart_id)}\s*[—\-–:]\s*",
            "",
            subpart_heading,
            flags=re.I,
        )
        sections = [
            _parse_xml_section(section, image_paths)
            for section in _owned_xml_elements(subpart, "SECTION")
        ]
        part_data["subparts"].append(
            {
                "subpart": subpart_id,
                "title": clean_text(subpart_title, is_title=True),
                "sections": sections,
            }
        )

    for appendix in _owned_xml_elements(root, "APPENDIX"):
        appendix_id = appendix.get("N", "").strip()
        part_data["appendices"].append(
            {
                "appendix": appendix_id,
                "title": _direct_head_text(appendix),
                "content": _xml_body_text(appendix),
                "figures": _extract_xml_figures(appendix, image_paths),
            }
        )

    identifiers = [
        section["section"]
        for section in part_data["sections"]
        + [item for subpart in part_data["subparts"] for item in subpart["sections"]]
    ]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError(f"Duplicate section identifiers in Title {cfr_title} Part {part_num}")
    source_sections = {
        section.get("N", "").strip() for section in root.find_all(attrs={"TYPE": "SECTION"})
    }
    source_appendices = {
        appendix.get("N", "").strip() for appendix in root.find_all(attrs={"TYPE": "APPENDIX"})
    }
    parsed_appendices = {appendix["appendix"] for appendix in part_data["appendices"]}
    if set(identifiers) != source_sections or parsed_appendices != source_appendices:
        raise ValueError(
            f"Incomplete eCFR structure in Title {cfr_title} Part {part_num}; "
            f"missing sections {sorted(source_sections - set(identifiers))}; "
            f"missing appendices {sorted(source_appendices - parsed_appendices)}"
        )
    all_content = [
        section["content"]
        for section in part_data["sections"]
        + [item for subpart in part_data["subparts"] for item in subpart["sections"]]
    ] + [appendix["content"] for appendix in part_data["appendices"]]
    if any("website feedback" in content.lower() for content in all_content):
        raise ValueError(f"eCFR website chrome found in Title {cfr_title} Part {part_num}")

    return part_data


def crawl_ecfr_part(
    part_num: int,
    cfr_title: int = 14,
    part_info: dict | None = None,
    effective_date: str | None = None,
    xml_content: str | None = None,
) -> dict | None:
    """Crawl one FAR part from official eCFR versioner XML."""
    effective_date = effective_date or get_latest_ecfr_date(cfr_title)
    if xml_content is None:
        api_url = f"{ECFR_API}/{effective_date}/title-{cfr_title}.xml?part={part_num}"
        xml_content = fetch_page(api_url)
    if not xml_content:
        return None
    part_data = parse_ecfr_part_xml(xml_content, part_num, cfr_title, effective_date, part_info)
    figures = [
        figure
        for section in part_data["sections"]
        + [item for subpart in part_data["subparts"] for item in subpart["sections"]]
        + part_data["appendices"]
        for figure in section["figures"]
    ]
    for figure in {item["src"]: item for item in figures}.values():
        download_image(figure["originalUrl"], IMAGES_DIR / figure["src"], cfr_title)
    return part_data


def remove_unused_far_images(referenced: set[str]) -> None:
    """Remove files not referenced by a fully successful FAR crawl."""
    if not IMAGES_DIR.is_dir():
        return
    for path in IMAGES_DIR.rglob("*"):
        if path.is_file() and path.relative_to(IMAGES_DIR).as_posix() not in referenced:
            path.unlink()
    directories = sorted(
        (path for path in IMAGES_DIR.rglob("*") if path.is_dir()),
        key=lambda path: len(path.parts),
        reverse=True,
    )
    for directory in directories:
        if not any(directory.iterdir()):
            directory.rmdir()


def crawl_section_detail(section_id: str, cfr_title: int = 14) -> str:
    """Fetch detailed content for a specific section."""
    part_num = section_id.split(".")[0]
    url = f"{ECFR_BASE}/current/title-{cfr_title}/part-{part_num}/section-{section_id}"

    html_content = fetch_page(url)
    if not html_content:
        return ""

    soup = BeautifulSoup(html_content, "lxml")

    # Find the section content
    section_div = soup.find("div", class_=re.compile(r"section|cfr-section", re.I))
    if section_div:
        # Remove the header
        header = section_div.find(
            ["h1", "h2", "h3", "h4"], class_=re.compile(r"section-head", re.I)
        )
        if header:
            header.decompose()

        return clean_html_content(section_div, ECFR_BASE)

    return ""


# Pilot index parts - commonly needed for pilot training
PILOT_INDEX_PARTS = {
    14: [
        1,
        3,
        5,
        11,
        13,
        14,
        15,
        16,
        17,
        21,
        23,
        25,
        26,
        27,
        29,
        31,
        33,
        34,
        35,
        36,
        39,
        43,
        45,
        47,
        48,
        49,
        60,
        61,
        63,
        65,
        67,
        68,
        71,
        73,
        77,
        91,
        93,
        95,
        97,
        99,
        101,
        103,
        105,
        107,
        110,
        117,
        119,
        120,
        121,
        125,
        129,
        133,
        135,
        136,
        137,
        139,
        141,
        142,
        145,
        147,
        150,
        151,
        152,
        153,
        155,
        156,
        157,
        158,
        161,
        169,
        170,
        171,
        183,
        185,
        187,
        189,
        193,
        198,
    ],
    49: list(TITLE_49_PARTS),  # Hazmat, NTSB, TSA security, flight schools
}


def main():
    """Main function to crawl FAR from eCFR."""
    print("FAR Crawler - Downloading Federal Aviation Regulations from eCFR")
    print("=" * 70)

    # Create output directory
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Get TOC for Title 14 (Aeronautics and Space)
    print("\nFetching Title 14 CFR table of contents...")
    title14_parts = get_ecfr_toc(14)
    print(f"  Found {len(title14_parts)} parts in Title 14")

    # Get TOC for Title 49 (Transportation) - for NTSB, hazmat, etc.
    print("\nFetching Title 49 CFR table of contents...")
    title49_parts = get_ecfr_toc(49)
    print(f"  Found {len(title49_parts)} parts in Title 49")
    missing_title49 = set(TITLE_49_PARTS) - {part["part"] for part in title49_parts}
    if not title14_parts or missing_title49:
        raise RuntimeError(
            f"Incomplete eCFR table of contents; missing Title 49 parts: {sorted(missing_title49)}"
        )

    # Combine and mark pilot index parts
    all_parts = []

    for part in title14_parts:
        part["isPilotIndex"] = part["part"] in PILOT_INDEX_PARTS.get(14, [])
        all_parts.append(part)

    title14_part_numbers = {part["part"] for part in title14_parts}
    collisions = title14_part_numbers & set(TITLE_49_PARTS)
    if collisions:
        raise RuntimeError(
            f"CFR titles require conflicting output paths for parts: {sorted(collisions)}"
        )

    for part in title49_parts:
        # Only include relevant Title 49 parts
        if (
            part["part"] in PILOT_INDEX_PARTS.get(49, [])
            and part["part"] not in title14_part_numbers
        ):
            part["isPilotIndex"] = True
            all_parts.append(part)

    print(f"\nTotal parts to crawl: {len(all_parts)}")
    pilot_count = sum(1 for p in all_parts if p.get("isPilotIndex"))
    print(f"Pilot index parts: {pilot_count}")

    # Crawl each part
    crawled_parts = []
    part_snapshots = {}
    referenced_images: set[str] = set()
    effective_dates = {
        title: get_latest_ecfr_date(title)
        for title in {int(part.get("cfr_title", "14")) for part in all_parts}
    }
    part_numbers_by_title: dict[int, set[int]] = {}
    for part in all_parts:
        title = int(part.get("cfr_title", "14"))
        part_numbers_by_title.setdefault(title, set()).add(part["part"])
    title_xml_parts = {
        title: fetch_ecfr_title_parts(title, effective_dates[title], part_numbers)
        for title, part_numbers in part_numbers_by_title.items()
        if len(part_numbers) > 20
    }

    for part_info in tqdm(all_parts, desc="Crawling FAR parts"):
        part_num = part_info["part"]
        cfr_title = int(part_info.get("cfr_title", "14"))

        part_data = crawl_ecfr_part(
            part_num,
            cfr_title,
            part_info,
            effective_date=effective_dates[cfr_title],
            xml_content=title_xml_parts.get(cfr_title, {}).get(part_num),
        )

        if part_data:
            # Add metadata
            part_data["isPilotIndex"] = part_info.get("isPilotIndex", False)
            referenced_images.update(
                figure["src"]
                for section in part_data["sections"]
                + [item for subpart in part_data["subparts"] for item in subpart["sections"]]
                + part_data["appendices"]
                for figure in section["figures"]
            )

            part_snapshots[part_num] = part_data

            # Count sections
            section_count = len(part_data.get("sections", []))
            section_count += sum(
                len(sp.get("sections", [])) for sp in part_data.get("subparts", [])
            )
            appendix_count = len(part_data.get("appendices", []))
            figure_count = sum(
                len(reference["figures"])
                for reference in part_data["sections"]
                + [item for subpart in part_data["subparts"] for item in subpart["sections"]]
                + part_data["appendices"]
            )

            crawled_parts.append(
                {
                    "part": part_num,
                    "title": part_data.get("title", ""),
                    "file": f"far/part{part_num}.json",
                    "cfr": part_data.get("cfr", f"{cfr_title} CFR Part {part_num}"),
                    "subchapter": part_data.get("subchapter", ""),
                    "subchapterTitle": part_data.get("subchapterTitle", ""),
                    "isPilotIndex": part_data.get("isPilotIndex", False),
                    "sectionCount": section_count,
                    "appendixCount": appendix_count,
                    "figureCount": figure_count,
                }
            )
        else:
            raise RuntimeError(
                f"Could not fetch Title {cfr_title} Part {part_num}; snapshot unchanged"
            )

    # Sort by part number
    crawled_parts.sort(key=lambda x: x["part"])

    # Publish JSON only after every source part and referenced figure succeeded.
    for part_num, part_data in part_snapshots.items():
        with open(DATA_DIR / f"part{part_num}.json", "w", encoding="utf-8") as f:
            json.dump(part_data, f, indent=2, ensure_ascii=False)

    # Create index files

    # Full index
    full_index = {
        "title": "Federal Aviation Regulations (14 CFR) - Full Index",
        "description": "Complete Title 14 Code of Federal Regulations from eCFR",
        "lastUpdated": max(effective_dates.values()),
        "fetchedAt": time.strftime("%Y-%m-%d"),
        "effectiveDates": {str(title): value for title, value in sorted(effective_dates.items())},
        "source": "eCFR (ecfr.gov)",
        "indexType": "full",
        "totalFigures": len(referenced_images),
        "parts": crawled_parts,
    }

    with open(DATA_DIR / "index.json", "w", encoding="utf-8") as f:
        json.dump(full_index, f, indent=2, ensure_ascii=False)

    # Pilot index (filtered)
    pilot_index_parts = [p for p in crawled_parts if p.get("isPilotIndex", False)]
    pilot_index = {
        "title": "Federal Aviation Regulations - Pilot Index",
        "description": "CFR parts commonly found in pilot reference manuals (ASA FAR/AIM)",
        "lastUpdated": max(effective_dates.values()),
        "fetchedAt": time.strftime("%Y-%m-%d"),
        "effectiveDates": {str(title): value for title, value in sorted(effective_dates.items())},
        "source": "eCFR (ecfr.gov)",
        "indexType": "pilot",
        "parts": pilot_index_parts,
    }

    with open(DATA_DIR / "pilot-index.json", "w", encoding="utf-8") as f:
        json.dump(pilot_index, f, indent=2, ensure_ascii=False)

    remove_unused_far_images(referenced_images)

    print(f"\n{'=' * 70}")
    print("Crawl complete!")
    print(f"  Total parts crawled: {len(crawled_parts)}")
    print(f"  Pilot index parts: {len(pilot_index_parts)}")
    print("  Failed parts: 0")
    print(f"  FAR figures: {len(referenced_images)}")
    print(f"\nData saved to {DATA_DIR}")
    print("  - index.json (Full Index)")
    print("  - pilot-index.json (Pilot Index)")


if __name__ == "__main__":
    main()
