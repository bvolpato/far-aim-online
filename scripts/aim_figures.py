"""Reconcile FAA HTML figure metadata against the dated, current AIM PDF."""

import hashlib
import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import date, datetime
from io import BytesIO
from urllib.parse import unquote, urljoin, urlsplit

import pypdfium2
from bs4 import BeautifulSoup, Tag
from pypdf import PdfReader

MIRROR_BASE_URL = "https://www.faa.gov/air_traffic/publications/aim_html/"
LABEL = re.compile(r"(FIG|TBL)\s+(\d+)[\-−‐–](\d+)[\-−‐–](\d+)")


def normalized_title(value: str) -> str:
    """Ignore typography and PDF word spacing without removing substantive words."""
    value = unicodedata.normalize("NFKD", value).casefold()
    return "".join(character for character in value if character.isalnum())


def _clean(value: str) -> str:
    return " ".join(value.translate(str.maketrans("−‐–", "---")).split())


def _label_parts(value: str) -> tuple[str, str] | None:
    match = LABEL.fullmatch(_clean(value))
    if match is None:
        return None
    return match[1], "-".join(match.groups()[1:])


def _title_matches(left: str, right: str) -> bool:
    return bool(normalized_title(left)) and normalized_title(left) == normalized_title(right)


def _filename(url: str) -> str:
    return normalized_title(unquote(urlsplit(url).path).rsplit("/", 1)[-1].rsplit(".", 1)[0])


@dataclass(frozen=True)
class FigureCaption:
    kind: str
    number: str
    title: str
    page: int
    source_url: str
    source_sha256: str
    asset_url: str | None = None

    @property
    def label(self) -> str:
        return f"{self.kind} {self.number}"

    @property
    def caption(self) -> str:
        return f"{self.label}: {self.title}" if self.title else self.label


@dataclass(frozen=True)
class FigureCatalog:
    figures: tuple[FigureCaption, ...]
    source_url: str
    source_sha256: str
    effective_date: str | None = None

    @property
    def provenance(self) -> dict[str, str]:
        result = {"sourceUrl": self.source_url, "sha256": self.source_sha256}
        if self.effective_date:
            result["effectiveDate"] = self.effective_date
        return result

    @classmethod
    def from_pdf(
        cls,
        pdf_bytes: bytes,
        source_url: str,
        expected_effective_date: str | None = None,
    ) -> "FigureCatalog":
        """Read positioned caption definitions, excluding in-text figure references."""
        digest = hashlib.sha256(pdf_bytes).hexdigest()
        reader = PdfReader(BytesIO(pdf_bytes))
        figures: list[FigureCaption] = []
        front_matter: list[str] = []
        with pypdfium2.PdfDocument(pdf_bytes) as document:
            for index in range(len(document)):
                page = document[index]
                text_page = page.get_textpage()
                try:
                    text = text_page.get_text_range()
                finally:
                    text_page.close()
                    page.close()
                if index < 40:
                    front_matter.append(text)
                if LABEL.search(text) is None:
                    continue
                figures.extend(_page_captions(reader.pages[index], index + 1, source_url, digest))

        front_text = "\n".join(front_matter)
        if "aeronautical information manual" not in normalized_words(front_text):
            raise ValueError("Figure catalog PDF is not the Aeronautical Information Manual")
        effective_date = _edition_date(front_text)
        if expected_effective_date and effective_date != expected_effective_date:
            raise ValueError(
                f"AIM PDF edition is {effective_date}, expected {expected_effective_date}"
            )
        if not figures:
            raise ValueError("AIM PDF contains no figure or table caption definitions")
        labels: dict[str, FigureCaption] = {}
        for figure in figures:
            previous = labels.get(figure.label)
            if previous and previous.title != figure.title:
                raise ValueError(f"AIM PDF has conflicting definitions for {figure.label}")
            labels.setdefault(figure.label, figure)
        return cls(tuple(labels.values()), source_url, digest, effective_date)


def normalized_words(value: str) -> str:
    return " ".join(value.casefold().split())


def _edition_date(front_matter: str) -> str | None:
    dates = re.findall(r"(?:\bAIM\s+(\d+/\d+/\d+)\b|\b(\d+/\d+/\d+)\s+AIM\b)", front_matter)
    parsed: list[date] = []
    for left, right in dates:
        try:
            parsed.append(datetime.strptime(left or right, "%m/%d/%y").date())
        except ValueError:
            continue
    return max(parsed).isoformat() if parsed else None


def _page_captions(page, page_number: int, source_url: str, digest: str) -> list[FigureCaption]:
    # The FAA PDF uses 8-point bold italic labels and nearby bold titles. Use
    # physical positions because content-stream order sometimes places the title first.
    rows: dict[float, list[tuple[str, str, float]]] = {}

    def collect(text, _cm, tm, font, size):
        if text.strip():
            baseline = round(tm[5], 1)
            font_name = font.get("/BaseFont", "") if font else ""
            points = (tm[0] ** 2 + tm[1] ** 2) ** 0.5 * size
            rows.setdefault(baseline, []).append((text, font_name, points))

    page.extract_text(visitor_text=collect)
    result = []
    for baseline, fragments in rows.items():
        parts = _label_parts("".join(text for text, _, _ in fragments))
        if not parts or not all("BoldItalic" in font for _, font, _ in fragments):
            continue
        title_rows = [
            (position, fragments)
            for position, fragments in rows.items()
            if 0 < baseline - position < 20
            and all("Bold" in font and "Italic" not in font for _, font, _ in fragments)
        ]
        title = ""
        if title_rows:
            position, title_fragments = max(title_rows)
            title = _clean("".join(text for text, _, _ in title_fragments))
            # Wrapped captions retain the same bold font and size on the next line.
            for following, fragments in sorted(rows.items(), reverse=True):
                if not 0 < position - following < 13:
                    continue
                if not all(
                    "Bold" in font
                    and "Italic" not in font
                    and abs(points - title_fragments[0][2]) < 0.2
                    for _, font, points in fragments
                ):
                    break
                title += " " + _clean("".join(text for text, _, _ in fragments))
                position = following
        result.append(FigureCaption(parts[0], parts[1], title, page_number, source_url, digest))
    return result


@dataclass(frozen=True)
class _MirrorFigure:
    kind: str
    number: str
    title: str
    asset_url: str


def _mirror_figures(html: str, page_url: str) -> list[_MirrorFigure]:
    soup = BeautifulSoup(html, "lxml")
    result = []
    for heading in soup.find_all(["h4", "h5", "figcaption"]):
        text = _clean(heading.get_text(" ", strip=True))
        match = LABEL.match(text)
        if match is None:
            continue
        image = heading.find_next("img")
        following_heading = heading.find_next(["h4", "h5", "figcaption"])
        if image is None or (
            following_heading is not None and following_heading in image.previous_elements
        ):
            continue
        result.append(
            _MirrorFigure(
                match[1],
                "-".join(match.groups()[1:]),
                _clean(text[match.end() :]),
                urljoin(page_url, image.get("src", "")),
            )
        )
    return result


class FigureResolver:
    """Require a unique current-PDF match, using older HTML only as corroboration."""

    def __init__(self, catalog: FigureCatalog, fetch_page: Callable[[str], str | None]):
        self.catalog = catalog
        self.fetch_page = fetch_page
        self._mirrors: dict[str, list[_MirrorFigure]] = {}
        self._sources: dict[str, BeautifulSoup] = {}

    def _mirror(self, page_url: str) -> list[_MirrorFigure]:
        mirror_url = urljoin(MIRROR_BASE_URL, urlsplit(page_url).path.rsplit("/", 1)[-1])
        if mirror_url not in self._mirrors:
            html = self.fetch_page(mirror_url)
            if not html:
                raise ValueError(f"Could not fetch corroborating AIM HTML: {mirror_url}")
            self._mirrors[mirror_url] = _mirror_figures(html, mirror_url)
        return self._mirrors[mirror_url]

    def _verified_mirror(self, record: _MirrorFigure) -> FigureCaption | None:
        matches = [
            figure
            for figure in self.catalog.figures
            if figure.kind == record.kind
            and figure.number == record.number
            and normalized_title(figure.title) == normalized_title(record.title)
        ]
        return (
            replace(matches[0], title=_clean(record.title), asset_url=record.asset_url)
            if len(matches) == 1
            else None
        )

    def resolve_mirror_asset(
        self, section_id: str, title: str, image_url: str, page_url: str
    ) -> FigureCaption:
        """Return a mirror asset only when its caption agrees with the current PDF."""
        current = self.resolve(section_id, title, image_url, page_url)
        mirrors = [
            record
            for record in self._mirror(page_url)
            if record.kind == current.kind and record.number == current.number
        ]
        if len(mirrors) == 1:
            verified = self._verified_mirror(mirrors[0])
            if verified:
                return verified
        raise ValueError(f"No current-PDF-verified mirror asset for {current.label}")

    def resolve(self, section_id: str, title: str, image_url: str, page_url: str) -> FigureCaption:
        topic = "-".join(section_id.split("-")[:2]) + "-"
        candidates = [figure for figure in self.catalog.figures if figure.number.startswith(topic)]
        exact = [figure for figure in candidates if _title_matches(figure.title, title)]
        if len(exact) == 1:
            # HTML preserves word boundaries that PDF kerning can split (RNA V).
            # Every substantive character must still agree with the current PDF.
            return replace(exact[0], title=_clean(title))
        prefix = [
            figure
            for figure in candidates
            if normalized_title(title)
            and normalized_title(figure.title)
            and normalized_title(figure.title).startswith(normalized_title(title))
        ]
        if not exact and len(prefix) == 1:
            return prefix[0]

        mirrors = self._mirror(page_url)
        filename_matches = [
            figure for figure in mirrors if _filename(figure.asset_url) == _filename(image_url)
        ]
        if len(filename_matches) == 1:
            verified = self._verified_mirror(filename_matches[0])
            # Untitled source figures have only a malformed FIG label. Their
            # unchanged original filename and the current PDF label are required.
            if verified and (
                _label_parts(title) is not None
                or _title_matches(verified.title, title)
                or any(
                    candidate.kind == verified.kind and candidate.number == verified.number
                    for candidate in exact + prefix
                )
            ):
                return verified

        ambiguous = exact or prefix
        context = self._next_example_references(page_url, image_url)
        referenced = [figure for figure in ambiguous if figure.label in context]
        if len(referenced) == 1:
            matching_mirrors = [
                record
                for record in mirrors
                if record.kind == referenced[0].kind and record.number == referenced[0].number
            ]
            if len(matching_mirrors) == 1:
                verified = self._verified_mirror(matching_mirrors[0])
                if verified:
                    return verified
        raise ValueError(
            f"Unreconciled AIM figure in {section_id}: {title!r} ({image_url}); "
            f"current PDF candidates: {[figure.label for figure in ambiguous]}"
        )

    def _next_example_references(self, page_url: str, image_url: str) -> set[str]:
        if page_url not in self._sources:
            html = self.fetch_page(page_url)
            if not html:
                raise ValueError(f"Could not fetch AIM figure context: {page_url}")
            self._sources[page_url] = BeautifulSoup(html, "lxml")
        images = [
            image
            for image in self._sources[page_url].find_all("img")
            if urljoin(page_url, image.get("src", "")) == image_url
        ]
        if len(images) != 1:
            return set()
        figure = images[0].find_parent("figure")
        if figure is None:
            return set()
        following = figure.find_next_sibling()
        if not isinstance(following, Tag) or following.name != "aside":
            return set()
        text = _clean(following.get_text(" ", strip=True))
        if not text.startswith("EXAMPLE-"):
            return set()
        return {f"{match[1]} {'-'.join(match.groups()[1:])}" for match in LABEL.finditer(text)}
