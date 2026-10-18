# ruff: noqa: E402
"""Regressions for FAA HTML captions with incorrect or repeated figure numbers."""

import hashlib
import sys
from io import BytesIO
from pathlib import Path

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aim_figures import FigureCaption, FigureCatalog, FigureResolver

PDF_URL = "https://www.faa.gov/air_traffic/publications/media/current-aim.pdf"
PAGE_URL = "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap4_section_1.html"
MIRROR_URL = "https://www.faa.gov/air_traffic/publications/aim_html/chap4_section_1.html"


def make_pdf(*, effective="7/9/26", title="Aeronautical Information Manual", conflict=False):
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    fonts = DictionaryObject()
    for key, base in [("F1", "Times-Roman"), ("F2", "Times-Bold"), ("F3", "Times-BoldItalic")]:
        fonts[NameObject("/" + key)] = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/" + base),
            }
        )
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): fonts})
    content = [
        f"BT /F1 10 Tf 60 750 Td ({title}) Tj ET",
        f"BT /F1 10 Tf 60 730 Td (AIM {effective}) Tj ET",
        # The text stream places the title first, but its baseline is below the label.
        "BT /F2 10 Tf 180 680 Td (Limits of Localizer Coverage) Tj ET",
        "BT /F3 8 Tf 280 692 Td (FIG 1-1-6) Tj ET",
        "BT /F1 11 Tf 60 650 Td (See FIG 1-1-7.) Tj ET",
    ]
    if conflict:
        content.extend(
            [
                "BT /F3 8 Tf 280 600 Td (FIG 1-1-6) Tj ET",
                "BT /F2 10 Tf 180 588 Td (A conflicting title) Tj ET",
            ]
        )
    stream = DecodedStreamObject()
    stream.set_data("\n".join(content).encode())
    page[NameObject("/Contents")] = writer._add_object(stream)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def catalog(*definitions):
    figures = tuple(
        FigureCaption(kind, number, title, page, PDF_URL, "digest")
        for kind, number, title, page in definitions
    )
    return FigureCatalog(figures, PDF_URL, "digest", "2026-07-09")


def resolver(figures, mirror="", source=""):
    pages = {MIRROR_URL: mirror, PAGE_URL: source}
    return FigureResolver(figures, pages.get)


def mirror_figure(number, title, filename, kind="FIG"):
    return f'<h4><em>{kind} {number}</em><br>{title}</h4><p><img src="{filename}"></p>'


def test_pdf_uses_physical_caption_position_and_records_dated_source():
    content = make_pdf()
    result = FigureCatalog.from_pdf(content, PDF_URL, "2026-07-09")
    assert [(figure.label, figure.title, figure.page) for figure in result.figures] == [
        ("FIG 1-1-6", "Limits of Localizer Coverage", 1)
    ]
    assert result.provenance == {
        "sourceUrl": PDF_URL,
        "sha256": hashlib.sha256(content).hexdigest(),
        "effectiveDate": "2026-07-09",
    }


@pytest.mark.parametrize(
    ("options", "error"),
    [
        ({"effective": "1/22/26"}, "edition is 2026-01-22, expected 2026-07-09"),
        ({"title": "Another publication"}, "not the Aeronautical Information Manual"),
        ({"conflict": True}, "conflicting definitions for FIG 1-1-6"),
    ],
)
def test_pdf_rejects_wrong_edition_publication_or_conflicting_definitions(options, error):
    with pytest.raises(ValueError, match=error):
        FigureCatalog.from_pdf(make_pdf(**options), PDF_URL, "2026-07-09")


def test_exact_title_and_topic_take_precedence_over_prefixes_and_wrong_html_number():
    figures = catalog(
        ("FIG", "4-1-1", "Taxiway Location Sign", 165),
        ("FIG", "4-1-2", "Taxiway Location Sign Collocated with Runway Holding Position Sign", 165),
        ("FIG", "10-2-1", "Taxiway Location Sign", 675),
    )
    result = resolver(figures).resolve("4-1-15", "Taxiway Location Sign", "image.png", PAGE_URL)
    assert result.label == "FIG 4-1-1"
    assert result.page == 165


def test_pdf_kerning_does_not_introduce_spaces_into_verified_html_title():
    figures = catalog(("FIG", "4-1-1", "RNA V Approach", 216))
    result = resolver(figures).resolve("4-1-15", "RNAV Approach", "image.svg", PAGE_URL)
    assert result.caption == "FIG 4-1-1: RNAV Approach"


def test_repeated_title_requires_same_original_filename_and_current_pdf_pair():
    figures = catalog(
        ("FIG", "4-1-1", "Basic T Design", 403),
        ("FIG", "4-1-2", "Basic T Design", 403),
    )
    mirror = mirror_figure("4-1-1", "Basic T Design", "Auto18.png") + mirror_figure(
        "4-1-2", "Basic T Design", "Auto17.png"
    )
    result = resolver(figures, mirror).resolve(
        "4-1-15", "Basic T Design", "https://example.org/Auto17.png", PAGE_URL
    )
    assert result.label == "FIG 4-1-2"
    assert result.asset_url.endswith("/Auto17.png")


def test_untitled_source_figure_requires_filename_and_current_pdf_label():
    figures = catalog(("FIG", "4-1-16", "", 426))
    mirror = mirror_figure("4-1-16", "", "aim0504_At Anchor4.png")
    result = resolver(figures, mirror).resolve(
        "4-1-15", "FIG 4-1-15", "https://example.org/aim0504_At_Anchor4.png", PAGE_URL
    )
    assert result.caption == "FIG 4-1-16"
    assert result.title == ""


def test_repeated_title_can_use_immediately_following_explicit_example_reference():
    figures = catalog(
        ("FIG", "4-1-1", "Induced Error in Position of Traffic", 216),
        ("FIG", "4-1-2", "Induced Error in Position of Traffic", 216),
    )
    mirror = mirror_figure("4-1-1", figures.figures[0].title, "first.webp") + mirror_figure(
        "4-1-2", figures.figures[1].title, "second.webp"
    )
    source = (
        '<figure><img src="image80.svg"></figure><aside>EXAMPLE- In FIG 4-1-2 traffic...</aside>'
    )
    result = resolver(figures, mirror, source).resolve(
        "4-1-15", figures.figures[0].title, PAGE_URL.rsplit("/", 1)[0] + "/image80.svg", PAGE_URL
    )
    assert result.label == "FIG 4-1-2"
    assert result.asset_url.endswith("/second.webp")


@pytest.mark.parametrize("example", ["", "EXAMPLE- See FIG 4-1-1 and FIG 4-1-2."])
def test_duplicate_titles_without_unique_context_fail_instead_of_guessing_order(example):
    figures = catalog(
        ("FIG", "4-1-1", "Same title", 216),
        ("FIG", "4-1-2", "Same title", 216),
    )
    mirror = mirror_figure("4-1-1", "Same title", "first.webp") + mirror_figure(
        "4-1-2", "Same title", "second.webp"
    )
    source = f'<figure><img src="different.svg"></figure><aside>{example}</aside>'
    with pytest.raises(ValueError, match="Unreconciled AIM figure"):
        resolver(figures, mirror, source).resolve(
            "4-1-15", "Same title", PAGE_URL.rsplit("/", 1)[0] + "/different.svg", PAGE_URL
        )


def test_table_image_is_not_relabelled_as_figure_with_same_number():
    figures = catalog(
        ("TBL", "4-1-1", "ICAO Cold Temperature Error Table", 598),
        ("FIG", "4-1-1", "Example Cold Temperature Restricted Airport List", 602),
    )
    result = resolver(figures).resolve(
        "4-1-15", "ICAO Cold Temperature Error Table", "image.png", PAGE_URL
    )
    assert result.label == "TBL 4-1-1"


def test_mirror_asset_is_rejected_when_older_caption_disagrees_with_current_pdf():
    figures = catalog(("FIG", "4-1-1", "A current title", 216))
    mirror = mirror_figure("4-1-1", "An obsolete title", "asset.webp")
    with pytest.raises(ValueError, match="No current-PDF-verified mirror asset"):
        resolver(figures, mirror).resolve_mirror_asset(
            "4-1-15", "A current title", "original.svg", PAGE_URL
        )
