# ruff: noqa: E402

import json
import sys
from io import BytesIO
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import crawl_advisory_circulars
import crawl_aim
from clean_data import clean_text, fix_encoding
from crawl_advisory_circulars import (
    clean_page_text,
    extraction_status,
    reflow_page_text,
    repair_cover_metadata,
    strip_repeated_margins,
)
from crawl_aim import (
    clean_html_content as clean_aim_html,
)
from crawl_aim import (
    extract_effective_date as extract_aim_effective_date,
)
from crawl_aim import (
    image_has_visible_content,
    parse_aim_chapter_links,
    parse_aim_chapter_overview,
    parse_aim_index,
    parse_aim_section,
    parse_aim_supplement_links,
)
from crawl_far import clean_html_content as clean_far_html
from crawl_pcg import (
    clean_pcg_value,
    expand_see_references,
    parse_official_pcg_page,
    parse_pcg,
    parse_pcg_index,
)
from update_advisory_circulars import extract_pdf_url


def test_ac_content_is_partial_when_any_pdf_page_is_missing():
    pages = [
        {"page": 1, "text": "word " * 60},
        {"page": 3, "text": "word " * 60},
    ]

    assert extraction_status(pages, 3) == "partial"
    assert extraction_status(pages, 2) == "partial"
    assert (
        extraction_status(
            [{"page": 1, "text": "word " * 60}, {"page": 2, "text": "word " * 60}],
            2,
        )
        == "parsed"
    )


def test_ac_document_page_prefers_official_advisory_circular_pdf():
    html = """
    <a href="/documentLibrary/media/support/attachment.pdf">Attachment</a>
    <a href="/documentLibrary/media/Advisory_Circular/AC_61-98D.pdf">Current AC</a>
    """

    assert extract_pdf_url(html) == (
        "https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_61-98D.pdf"
    )


def test_ac_refresh_resolves_current_pdf_url_before_download(monkeypatch):
    item = {
        "id": "ac-20-1",
        "number": "20-1",
        "title": "Aircraft Guidance",
        "issued": "2026-01-30",
        "documentUrl": "https://www.faa.gov/document/20-1",
        "pdfUrl": "https://www.faa.gov/documentLibrary/old.pdf",
    }
    downloaded: list[str] = []
    monkeypatch.setattr(
        crawl_advisory_circulars,
        "current_pdf_url",
        lambda *_args: "https://www.faa.gov/documentLibrary/current.pdf",
    )
    monkeypatch.setattr(
        crawl_advisory_circulars,
        "download_pdf",
        lambda url, *_args: downloaded.append(url) or b"%PDF-current",
    )
    monkeypatch.setattr(
        crawl_advisory_circulars,
        "extract_pdf_content",
        lambda *_args: ([{"page": 1, "text": "word " * 100}], 1, 0),
    )
    monkeypatch.setattr(crawl_advisory_circulars, "write_json", lambda *_args: None)

    result = crawl_advisory_circulars.crawl_item(item, 30, 10, False, True)

    assert downloaded == ["https://www.faa.gov/documentLibrary/current.pdf"]
    assert result["status"] == "parsed"
    assert result["pdfUrl"] == "https://www.faa.gov/documentLibrary/current.pdf"


def test_ac_refresh_reports_document_page_failure(monkeypatch):
    item = {
        "id": "ac-20-1",
        "number": "20-1",
        "title": "Aircraft Guidance",
        "documentUrl": "https://www.faa.gov/document/20-1",
        "pdfUrl": "https://www.faa.gov/documentLibrary/old.pdf",
    }

    def fail_resolution(*_args):
        raise requests.HTTPError("403 Client Error")

    monkeypatch.setattr(crawl_advisory_circulars, "current_pdf_url", fail_resolution)

    result = crawl_advisory_circulars.crawl_item(item, 30, 10, False, True)

    assert result["status"] == "failed"
    assert result["error"] == "403 Client Error"


def test_ac_refresh_reports_unpublished_pdf_as_unavailable(monkeypatch):
    item = {
        "id": "ac-20-1",
        "number": "20-1",
        "title": "Aircraft Guidance",
        "documentUrl": "https://www.faa.gov/document/20-1",
    }
    monkeypatch.setattr(crawl_advisory_circulars, "current_pdf_url", lambda *_args: None)

    result = crawl_advisory_circulars.crawl_item(item, 30, 10, False, True)

    assert result == {
        "id": "ac-20-1",
        "status": "unavailable",
        "pdfUrl": None,
        "error": "No PDF published",
    }


def test_ac_unavailable_refresh_clears_stale_pdf_and_content_metadata():
    item = {
        "id": "ac-20-1",
        "pdfUrl": "https://www.faa.gov/documentLibrary/old.pdf",
        "contentStatus": "parsed",
        "contentPath": "content/ac-20-1.json",
        "pageCount": 2,
        "extractedPageCount": 2,
        "wordCount": 200,
        "contentUpdated": "2026-01-01",
    }
    result = {
        "id": "ac-20-1",
        "status": "unavailable",
        "pdfUrl": None,
        "error": "No PDF published",
    }

    crawl_advisory_circulars.update_index(
        [item],
        [result],
        {"ac-20-1"},
        "2026-02-01",
        {"ac-20-1"},
    )

    assert item == {"id": "ac-20-1", "contentStatus": "unavailable"}


def test_ac_publication_policy_blocks_cached_and_refreshed_text(tmp_path, monkeypatch):
    reason = "Offline text requires third-party permission. Read the FAA publication."
    policy_path = tmp_path / "publication-policy.json"
    policy_path.write_text(json.dumps({"excludedOfflineText": {"ac-restricted": reason}}))
    monkeypatch.setattr(crawl_advisory_circulars, "PUBLICATION_POLICY_PATH", policy_path)
    monkeypatch.setattr(crawl_advisory_circulars, "AC_DIR", tmp_path)
    (tmp_path / "content").mkdir()
    (tmp_path / "content/ac-restricted.json").write_text("{}")

    def reject_network(*_args):
        raise AssertionError("Restricted publications must not be downloaded")

    monkeypatch.setattr(crawl_advisory_circulars, "current_pdf_url", reject_network)
    monkeypatch.setattr(crawl_advisory_circulars, "download_pdf", reject_network)
    item = {
        "id": "ac-restricted",
        "pdfUrl": "https://www.faa.gov/official.pdf",
        "contentPath": "content/ac-restricted.json",
        "contentStatus": "parsed",
        "wordCount": 100,
    }
    expected = {"id": "ac-restricted", "status": "unavailable", "error": reason}
    assert crawl_advisory_circulars.existing_result(item) == expected
    assert crawl_advisory_circulars.crawl_item(item, 30, 10, False, True) == expected
    crawl_advisory_circulars.update_index(
        [item], [expected], {item["id"]}, "2026-10-12", {item["id"]}
    )
    assert item == {
        "id": "ac-restricted",
        "pdfUrl": "https://www.faa.gov/official.pdf",
        "contentStatus": "unavailable",
        "contentError": reason,
    }


def test_ac_publication_policy_keeps_unrestricted_refreshes(tmp_path, monkeypatch):
    policy_path = tmp_path / "publication-policy.json"
    policy_path.write_text(json.dumps({"excludedOfflineText": {"ac-other": "Restricted"}}))
    monkeypatch.setattr(crawl_advisory_circulars, "PUBLICATION_POLICY_PATH", policy_path)
    monkeypatch.setattr(crawl_advisory_circulars, "current_pdf_url", lambda *_args: None)
    result = crawl_advisory_circulars.crawl_item(
        {"id": "ac-allowed", "documentUrl": "https://www.faa.gov/ac"}, 30, 10, False, True
    )
    assert result["error"] == "No PDF published"


def test_ac_subset_refresh_applies_policy_to_unselected_publications(tmp_path, monkeypatch):
    reason = "Third-party text must not be redistributed"
    policy_path = tmp_path / "publication-policy.json"
    policy_path.write_text(json.dumps({"excludedOfflineText": {"ac-restricted": reason}}))
    monkeypatch.setattr(crawl_advisory_circulars, "PUBLICATION_POLICY_PATH", policy_path)
    monkeypatch.setattr(crawl_advisory_circulars, "AC_DIR", tmp_path)
    monkeypatch.setattr(crawl_advisory_circulars, "CONTENT_DIR", tmp_path / "content")
    monkeypatch.setattr(crawl_advisory_circulars, "INDEX_PATH", tmp_path / "index.json")
    monkeypatch.setattr(crawl_advisory_circulars, "COVERAGE_PATH", tmp_path / "coverage.json")
    (tmp_path / "content").mkdir()
    items = [
        {"id": item_id, "number": item_id, "title": "Guidance", "documentUrl": "https://www.faa.gov/ac", "contentPath": f"content/{item_id}.json", "contentStatus": "parsed"}
        for item_id in ("ac-allowed", "ac-restricted")
    ]
    for item in items:
        (tmp_path / item["contentPath"]).write_text(json.dumps({**item, "status": "parsed", "pages": [{"page": 1, "text": "Cached text"}]}))
    (tmp_path / "index.json").write_text(json.dumps({"items": items}))

    assert crawl_advisory_circulars.main(["--id", "ac-allowed"]) == 0
    index = json.loads((tmp_path / "index.json").read_text())
    assert index["items"][0]["contentStatus"] == "parsed"
    assert index["items"][1]["contentError"] == reason
    assert "contentPath" not in index["items"][1]
    assert not (tmp_path / "content/ac-restricted.json").exists()
    coverage = json.loads((tmp_path / "coverage.json").read_text())
    assert coverage["counts"] == {"parsed": 1, "unavailable": 1}


def test_ac_pdf_cleaner_repairs_line_breaks_and_repeated_margins():
    pages = [
        clean_page_text(
            f"AC 61-98D\nFlight Review Guidance\nPage {page} of 3\ncompe-\n"
            f"tency requirements.\n\nOperational guidance {page}.\nArtifact \ufffd removed.\nAC 61-98D"
        )
        for page in range(1, 4)
    ]

    cleaned = strip_repeated_margins(pages)

    assert all("AC 61-98D" not in page for page in cleaned)
    assert all("competency requirements." in page for page in cleaned)
    assert all("Operational guidance" in page for page in cleaned)
    assert all("\ufffd" not in page for page in cleaned)


def test_ac_pdf_cleaner_repairs_pdfium_hyphens_and_reflows_prose():
    cleaned = clean_page_text(
        "CHAPTER 1. INTRODUCTION\r\n"
        "1.1.1 Purpose and Scope.\r\n"
        "This AC addresses manufacturing\ufffeand operationally induced\r\n"
        "anomalies in high\ufffeenergy rotating parts.\r\n"
        "1.1.2 Damage Tolerance Approach."
    )

    assert reflow_page_text(cleaned) == (
        "CHAPTER 1. INTRODUCTION\n\n"
        "1.1.1 Purpose and Scope.\n\n"
        "This AC addresses manufacturing- and operationally induced anomalies in "
        "high-energy rotating parts.\n\n"
        "1.1.2 Damage Tolerance Approach."
    )


def test_ac_pdf_cleaner_restores_cover_date_from_catalog_metadata():
    text = "Subject: Damage Tolerance Date: AC No: 33.70-5"

    assert repair_cover_metadata(text, "2026-07-02") == (
        "Subject: Damage Tolerance Date: 07/02/2026 AC No: 33.70-5"
    )


def test_ac_pdf_cleaner_restores_cover_date_before_line_break():
    text = "Subject: Export Airworthiness\nDate:\n\n1 PURPOSE."

    assert repair_cover_metadata(text, "2026-07-22") == (
        "Subject: Export Airworthiness\nDate: 07/22/2026\n\n1 PURPOSE."
    )


def test_ac_pdf_cleaner_normalizes_toc_without_merging_entries():
    text = clean_page_text(
        "CONTENTS\r\n"
        "Chapter 1. Introduction........................ 1-1\r\n"
        "1.1 Purpose. ................................... 1-1\r\n"
        "Appendix A. Manufacturing Test Case for Blade\r\n"
        "Slots .......................................... A-1"
    )

    assert reflow_page_text(text) == (
        "CONTENTS\n"
        "Chapter 1. Introduction  1-1\n"
        "1.1 Purpose.  1-1\n"
        "Appendix A. Manufacturing Test Case for Blade Slots  A-1"
    )


def test_ac_pdf_cleaner_preserves_table_rows():
    text = clean_page_text(
        "3.6 Design Target Risk.\r\n"
        "Table 3-1. Allowable Design Target Risk\r\n"
        "Component Feature DTR\r\n"
        "Axial Blade Slots Set 2.0 E-05"
    )

    assert reflow_page_text(text) == text


def test_ac_pdf_cleaner_normalizes_ocr_toc_fragments():
    text = clean_page_text(
        "Date:12/13/2023\n"
        "Table of Contents\n"
        "1. Purpose.\n"
        "1.1 Contents...1\n"
        "1.3 Audience\n"
        ".1\n"
        "1.4 Intent...\n"
        ".2\n"
        "2. References..2\n"
        "3. Guidance...3"
    )

    assert reflow_page_text(text) == (
        "Date: 12/13/2023\n"
        "Table of Contents\n"
        "1. Purpose.\n"
        "1.1 Contents  1\n"
        "1.3 Audience 1\n"
        "1.4 Intent  2\n"
        "2. References  2\n"
        "3. Guidance  3"
    )


from crawl_pcg import (
    extract_effective_date as extract_pcg_effective_date,
)


def test_clean_text_repairs_mojibake_and_preserves_aviation_symbols():
    text = (
        "VHF Omni \u00e2\u0088\u0092directional Range, ADS\u00e2\u0088\u0092B, "
        "Traffic Information Service\u00e2\u0088\u0092 Broadcast, "
        "14 CFR \u00c2\u00a7 91.155, \u00c2\u00bd SM, and "
        "low-level (\u00e2\u0089\u00a42,000 ft)."
    )

    cleaned = clean_text(text)

    assert "Omni-directional Range" in cleaned
    assert "ADS-B" in cleaned
    assert "Service-Broadcast" in cleaned
    assert "\u00a7" in cleaned
    assert "\u00bd SM" in cleaned
    assert "\u2264" in cleaned
    assert "\u00c2" not in cleaned
    assert "\u00e2" not in cleaned
    assert "\ufffd" not in cleaned


def test_aim_html_cleaner_keeps_paragraphs_and_formatting_clean():
    soup = BeautifulSoup(
        """
        <div>
          <p><strong>ADS\u00e2\u0088\u0092B</strong> Out applies under 14 CFR \u00c2\u00a7 91.225.</p>
          <p>Use VHF Omni \u00e2\u0088\u0092directional Range guidance.</p>
        </div>
        """,
        "lxml",
    )

    cleaned = clean_aim_html(soup.div, "https://www.faraim.org/faa/aim/")

    assert "**ADS-B** Out applies under 14 CFR \u00a7 91.225." in cleaned
    assert "VHF Omni-directional Range" in cleaned
    assert "\n\n" in cleaned
    assert "\u00e2" not in cleaned
    assert "\u00c2" not in cleaned


def test_aim_crawler_parses_official_index_and_effective_date():
    html = """
    <div class="publication-summary"><p><strong>Effective:</strong> 7/9/2026</p></div>
    <ul class="paragraph-list">
      <li><a href="./chap1_section_1.html#1-1-1">1-1-1. General</a></li>
      <li><a href="./chap1_section_1.html#1-1-2">1-1-2. Navigation Aids</a></li>
    </ul>
    """

    chapters = parse_aim_index(html)

    assert extract_aim_effective_date(html) == "2026-07-09"
    assert chapters[1]["sections"] == [
        {
            "section": "1-1-1",
            "title": "General",
            "url": "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap1_section_1.html",
        },
        {
            "section": "1-1-2",
            "title": "Navigation Aids",
            "url": "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap1_section_1.html",
        },
    ]


def test_aim_crawler_fetches_section_links_from_index_chapter_overviews(monkeypatch, tmp_path):
    index_url = crawl_aim.AIM_INDEX_URL
    chapter_url = "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap_1.html"
    section_url = (
        "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap1_section_1.html"
    )
    pages = {
        index_url: """
            <div class="publication-summary"><p>Effective: 7/9/2026</p></div>
            <a href="./chap_1.html">Chapter 1. Air Navigation</a>
        """,
        chapter_url: """
            <div class="section-content">
              <ul class="paragraph-list">
                <li><a href="./chap1_section_1.html#1-1-1">1-1-1. General</a></li>
              </ul>
            </div>
        """,
        section_url: """
            <article><h4 class="paragraph-title" id="1-1-1">1-1-1. General</h4>
              <p>Section content.</p>
            </article>
        """,
    }
    fetched = []

    def fake_fetch(url, retries=5):
        fetched.append(url)
        return pages[url]

    monkeypatch.setattr(crawl_aim, "fetch_page", fake_fetch)
    monkeypatch.setattr(crawl_aim, "DATA_DIR", tmp_path / "data" / "aim")
    monkeypatch.setattr(crawl_aim, "IMAGES_DIR", tmp_path / "images")
    monkeypatch.setattr(crawl_aim, "tqdm", lambda items, **kwargs: items)

    assert parse_aim_chapter_links(pages[index_url]) == {1: chapter_url}
    assert parse_aim_chapter_overview(pages[chapter_url], chapter_url)[1]["sections"]

    crawl_aim.main()

    assert fetched == [index_url, chapter_url, section_url]
    chapter = json.loads((tmp_path / "data" / "aim" / "chapter1.json").read_text())
    assert chapter["sections"][0]["section"] == "1-1-1"


def test_aim_crawler_includes_change_notes_and_appendices():
    html = """
      <a href="./chap0_section_0.html">Explanation of Changes</a>
      <a href="./appendix_1.html">Appendix 1</a>
      <a href="./appendix_5.html">Appendix 5</a>
    """

    assert parse_aim_supplement_links(html) == [
        {
            "section": "0-0-1",
            "title": "Explanation of Changes",
            "url": "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap0_section_0.html",
        },
        {
            "section": "A-1",
            "title": "Appendix 1",
            "url": "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/appendix_1.html",
        },
        {
            "section": "A-5",
            "title": "Appendix 5",
            "url": "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/appendix_5.html",
        },
    ]


def test_aim_crawler_keeps_all_tables_and_figure_metadata(monkeypatch):
    tables = []
    for table_index in range(6):
        title = f"Table {table_index + 1}" if table_index < 5 else ""
        title_attribute = ' title="Table title fallback"' if table_index == 5 else ""
        caption = f"<caption>{title}</caption>" if title else ""
        rows = "".join(f"<tr><td>row-{table_index}-{row}</td></tr>" for row in range(31))
        tables.append(
            f"<table{title_attribute}>{caption}<thead><tr><th>Value</th></tr></thead>"
            f"<tbody>{rows}</tbody></table>"
        )
    extra_images = "".join(
        f'<img src="./images/extra-{image_index}.png" alt="Extra image {image_index}">'
        for image_index in range(1, 22)
    )

    html = f"""
        <article>
          <h4 class="paragraph-title" id="1-1-1">1-1-1. General</h4>
          <p>Inline <img src="./images/inline.png" alt="Inline semantic label"> image.</p>
          <figure>
            <figcaption><span>FIG 1-1-1</span><span>Example figure</span></figcaption>
            <img src="./images/figure.png" alt="Figure semantic label">
          </figure>
          {"".join(tables)}
          {extra_images}
        </article>
    """

    monkeypatch.setattr(crawl_aim, "download_image", lambda url, save_path: True)

    section = parse_aim_section(
        html,
        "1-1-1",
        "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap1_section_1.html",
        1,
    )

    assert len(section["tables"]) == 6
    assert all(len(table["rows"]) == 31 for table in section["tables"])
    assert len(section["figures"]) == 23
    assert section["figures"][-1]["alt"] == "Extra image 21"
    assert section["tables"][0]["caption"] == "Table 1"
    assert section["tables"][5]["caption"] == "Table title fallback"
    assert section["figures"][:2] == [
        {
            "src": "chapter1/section-1-1-1-img-1.png",
            "alt": "Inline semantic label",
            "caption": "",
            "originalUrl": "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/images/inline.png",
        },
        {
            "src": "chapter1/section-1-1-1-img-2.png",
            "alt": "Figure semantic label",
            "caption": "FIG 1-1-1 Example figure",
            "originalUrl": "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/images/figure.png",
        },
    ]
    assert "Inline semantic label" in section["content"]


def test_aim_table_parser_expands_rowspan_and_colspan():
    soup = BeautifulSoup(
        """
        <table>
          <thead><tr><th rowspan="2">Code</th><th colspan="2">Limits</th></tr>
          <tr><th>Low</th><th>High</th></tr></thead>
          <tbody>
            <tr><td rowspan="2">A</td><td>1</td><td>2</td></tr>
            <tr><td colspan="2">3</td></tr>
          </tbody>
        </table>
        """,
        "lxml",
    )

    assert crawl_aim.extract_table(soup.table) == {
        "headers": ["Code", "Limits / Low", "Limits / High"],
        "rows": [["A", "1", "2"], ["A", "3", "3"]],
    }


def test_aim_table_parser_keeps_first_data_row_without_header_cells():
    soup = BeautifulSoup(
        """
        <table aria-label="Runway values">
          <tr><td>Runway 18</td><td>2,500 feet</td></tr>
          <tr><td>Runway 36</td><td>3,000 feet</td></tr>
        </table>
        """,
        "lxml",
    )

    assert crawl_aim.extract_table(soup.table) == {
        "caption": "Runway values",
        "headers": ["", ""],
        "rows": [["Runway 18", "2,500 feet"], ["Runway 36", "3,000 feet"]],
    }


def test_aim_crawler_splits_official_paragraph_sections():
    html = """
    <article><div class="body conbody">
      <h4 class="paragraph-title" id="1-1-1">1-1-1. General</h4>
      <ol><li>First section content.</li></ol>
      <h4 class="paragraph-title" id="1-1-2">1-1-2. Navigation Aids</h4>
      <p>Second section content.</p>
    </div></article>
    """

    section = parse_aim_section(
        html,
        "1-1-1",
        "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap1_section_1.html",
        1,
    )

    assert section["title"] == "General"
    assert "First section content." in section["content"]
    assert "Second section content." not in section["content"]


def test_aim_crawler_rejects_blank_figure_placeholders():
    blank = BytesIO()
    Image.new("RGBA", (64, 64), "white").save(blank, format="PNG")
    figure = Image.new("RGBA", (64, 64), "white")
    figure.putpixel((32, 32), (0, 0, 0, 255))
    visible = BytesIO()
    figure.save(visible, format="PNG")

    assert not image_has_visible_content(blank.getvalue())
    assert image_has_visible_content(visible.getvalue())
    assert not image_has_visible_content(b"not an image")


def test_far_html_cleaner_formats_internal_cfr_links():
    soup = BeautifulSoup(
        """
        <div>
          <p>See <a href="/current/title-14/section-61.113">\u00a7 61.113</a>
          and <a href="/current/title-14/part-91">Part 91</a>.</p>
        </div>
        """,
        "lxml",
    )

    cleaned = clean_far_html(soup.div, "https://www.ecfr.gov/current/title-14/part-61")

    assert "\u00a7 61.113" in cleaned
    assert "Part 91" in cleaned
    assert "https://www.ecfr.gov" not in cleaned


def test_fix_encoding_removes_control_artifacts():
    cleaned = fix_encoding("0\u0003 to 179\u0003 and bad \ufffd marker")

    assert cleaned == "0 to 179 and bad marker"


def test_clean_text_preserves_far_table_ellipsis_spacing():
    cleaned = clean_text("for . . .\n| Then you must log at least . . .")

    assert "for . . ." in cleaned
    assert "at least . . ." in cleaned


def test_clean_text_repairs_common_aim_pdf_word_breaks():
    cleaned = clean_text("F AA guidance for te rritories interrupt s t hought and date (s).")

    assert cleaned == "FAA guidance for territories interrupts thought and date(s)."


def test_pcg_cleaner_preserves_article_before_acronym():
    cleaned = clean_pcg_value("A GPS approach and A STA value.")

    assert cleaned == "A GPS approach and A STA value."


def test_pcg_parser_keeps_hyphenated_terms_and_expands_see_only_definitions():
    terms = parse_pcg("""
        Header
        A
        ADS-B- (See AUTOMATIC DEPENDENT SURVEILLANCE-BROADCAST.)
        AUTOMATIC DEPENDENT SURVEILLANCE-BROADCAST- A surveillance system using broadcast position reports.
        CHA
        (See CONTINGENCY HAZARD AREA)
        CONTINGENCY HAZARD AREA- Defined airspace for contingency operations.
        RwyCC-
        (See RUNWAY CONDITION CODES.)
        RUNWAY CONDITION CODES (RwyCC)- Numerical runway condition readings.
        RNAV-
        (See AREA NAVIGATION (RNAV).)
        AREA NAVIGATION (RNAV)- Navigation on any desired flight path.
        CWT-
        (See CONSOLIDATED WAKE TURBULENCE.)
        WAKE TURBULENCE- Wake vortex turbulence behind aircraft.
        PRM-
        (See AREA NAVIGATION (RNAV) GLOBAL POSITIONING SYSTEM (GPS) PRECISION RUNWAY
        MONITORING (PRM) APPROACH.)
        (See PRM APPROACH.)
        PRM APPROACH- Closely spaced parallel runway approach.
        FLIP-
        (See DoD FLIP.)
        DoD FLIP- Department of Defense Flight Information Publications.
        IFR DEPARTURE PROCEDURE-
        (See IFR TAKEOFF MINIMUMS AND DEPARTURE PROCEDURES.)
        (Refer to AIM.)
        IFR TAKEOFF MINIMUMS AND DEPARTURE PROCEDURES- IFR departure guidance.
        ICAO 3LD-
        (See ICAO Term ICAO Three-Letter Designator)
        ICAO Three-Letter Designator (3LD)- An exclusive designator.
        PCG A-1 2/20/25 Pilot/Controller Glossary
        B
        """)

    adsb = next(term for term in terms if term["term"] == "ADS-B")
    cha = next(term for term in terms if term["term"] == "CHA")
    rwycc = next(term for term in terms if term["term"] == "RwyCC")
    rnav = next(term for term in terms if term["term"] == "RNAV")
    cwt = next(term for term in terms if term["term"] == "CWT")
    prm = next(term for term in terms if term["term"] == "PRM")
    flip = next(term for term in terms if term["term"] == "FLIP")
    ifr_departure = next(term for term in terms if term["term"] == "IFR DEPARTURE PROCEDURE")
    icao = next(term for term in terms if term["term"] == "ICAO 3LD")

    assert "AUTOMATIC DEPENDENT SURVEILLANCE-BROADCAST:" in adsb["definition"]
    assert "A surveillance system using broadcast position reports." in adsb["definition"]
    assert (
        "CONTINGENCY HAZARD AREA: Defined airspace for contingency operations." in cha["definition"]
    )
    assert (
        "RUNWAY CONDITION CODES (RwyCC): Numerical runway condition readings."
        in rwycc["definition"]
    )
    assert "AREA NAVIGATION (RNAV): Navigation on any desired flight path." in rnav["definition"]
    assert "WAKE TURBULENCE: Wake vortex turbulence behind aircraft." in cwt["definition"]
    assert "PRM APPROACH: Closely spaced parallel runway approach." in prm["definition"]
    assert "DoD FLIP: Department of Defense Flight Information Publications." in flip["definition"]
    assert (
        "IFR TAKEOFF MINIMUMS AND DEPARTURE PROCEDURES: IFR departure guidance."
        in ifr_departure["definition"]
    )
    assert "(Refer to AIM.)" in ifr_departure["definition"]
    assert not any(term["term"].startswith("MONITORING") for term in terms)
    assert "ICAO Three-Letter Designator (3LD): An exclusive designator." in icao["definition"]
    assert not any(term["term"].startswith("(See") for term in terms)
    assert not any(term["term"].startswith("PCG ") for term in terms)


def test_pcg_crawler_parses_official_index_and_entries():
    index_html = """
    <p>Effective: 7/9/26</p>
    <a href="glossary-a.html">A</a>
    <a href="glossary-b.html">B</a>
    """
    page_html = """
    <article class="pcg-content">
      <p class="glossary-term-entry"><dfn class="term-name">AAM</dfn>-</p>
      <p class="glossary-cross-reference">
        <span class="cross-ref-label">See</span>
        <a class="cross-ref-link" data-term="ADVANCED_AIR_MOBILITY">ADVANCED AIR MOBILITY</a>
      </p>
      <p class="glossary-term-entry"><dfn class="term-name">ADVANCED AIR MOBILITY</dfn>-
        Transportation using aircraft with advanced technologies.
      </p>
      <p class="glossary-term-entry">ACCELERATE-STOP DISTANCE AVAILABLE- Runway plus stopway length.</p>
    </article>
    """

    terms = expand_see_references(parse_official_pcg_page(page_html))

    assert extract_pcg_effective_date(index_html) == "2026-07-09"
    assert parse_pcg_index(index_html) == ["glossary-a.html", "glossary-b.html"]
    assert terms == [
        {
            "term": "AAM",
            "definition": (
                "ADVANCED AIR MOBILITY: Transportation using aircraft with advanced technologies."
            ),
        },
        {
            "term": "ADVANCED AIR MOBILITY",
            "definition": "Transportation using aircraft with advanced technologies.",
        },
        {
            "term": "ACCELERATE-STOP DISTANCE AVAILABLE",
            "definition": "Runway plus stopway length.",
        },
    ]


def test_pcg_official_parser_repairs_malformed_dfn_boundaries():
    page_html = """
    <article class="pcg-content">
      <p class="glossary-term-entry">
        <dfn class="term-name">AUTOMATIC DEPENDENT SURVEILLANCE-BROADCAST IN (ADS</dfn>-B IN)-
        A surveillance system using broadcast position reports.
      </p>
      <p class="glossary-term-entry">
        <dfn class="term-name">GROUND-BASED INTERVAL MANAGEMENT-SPACING (GIM</dfn>-S), SPEED ADVISORY-
        A calculated speed that meets the schedule.
      </p>
    </article>
    """

    assert parse_official_pcg_page(page_html) == [
        {
            "term": "AUTOMATIC DEPENDENT SURVEILLANCE-BROADCAST IN (ADS-B IN)",
            "definition": "A surveillance system using broadcast position reports.",
        },
        {
            "term": "GROUND-BASED INTERVAL MANAGEMENT-SPACING (GIM-S), SPEED ADVISORY",
            "definition": "A calculated speed that meets the schedule.",
        },
    ]
