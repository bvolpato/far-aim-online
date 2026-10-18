# ruff: noqa: E402

import json
import sys
import zipfile
from io import BytesIO
from pathlib import Path

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import crawl_far
from crawl_far import parse_ecfr_part_xml


def test_ecfr_xml_parser_preserves_subparts_appendices_and_suffixed_sections():
    xml = """
    <DIV5 N="61" TYPE="PART">
      <HEAD>PART 61—CERTIFICATION: PILOTS</HEAD>
      <DIV8 N="61.1" TYPE="SECTION">
        <HEAD>§ 61.1 Applicability.</HEAD>
        <P>This part applies to pilots.</P>
      </DIV8>
      <DIV8 N="61.1-1" TYPE="SECTION">
        <HEAD>§ 61.1-1 Additional applicability.</HEAD>
        <P>This distinct suffixed section must remain distinct.</P>
      </DIV8>
      <DIV6 N="A" TYPE="SUBPART">
        <HEAD>Subpart A—General</HEAD>
        <DIV>
          <DIV8 N="61.3" TYPE="SECTION">
            <HEAD>§ 61.3 Requirement for certificates.</HEAD>
            <P>A person may not serve without a certificate.</P>
          </DIV8>
        </DIV>
      </DIV6>
      <DIV9 N="Appendix A to Part 61" TYPE="APPENDIX">
        <HEAD>Appendix A to Part 61—Airman Certification Standards</HEAD>
        <P>Use the applicable airman certification standards.</P>
      </DIV9>
    </DIV5>
    """

    part = parse_ecfr_part_xml(xml, 61, 14, "2026-08-11")

    assert part["effectiveDate"] == "2026-08-11"
    assert [section["section"] for section in part["sections"]] == ["61.1", "61.1-1"]
    assert part["subparts"][0]["sections"][0]["section"] == "61.3"
    assert part["appendices"] == [
        {
            "appendix": "Appendix A to Part 61",
            "title": "Appendix A to Part 61-Airman Certification Standards",
            "content": "Use the applicable airman certification standards.",
            "figures": [],
        }
    ]


def test_ecfr_title_xml_split_is_structural_and_complete():
    xml = """
    <DIV1 N="14" TYPE="TITLE">
      <DIV5 N="1" TYPE="PART"><HEAD>PART 1-DEFINITIONS</HEAD></DIV5>
      <DIV5 N="3" TYPE="PART"><HEAD>PART 3-GENERAL REQUIREMENTS</HEAD></DIV5>
    </DIV1>
    """

    parts = crawl_far.split_ecfr_title_xml(xml, {1, 3})

    assert set(parts) == {1, 3}
    assert 'N="1" TYPE="PART"' in parts[1]
    assert 'N="3" TYPE="PART"' in parts[3]


def test_ecfr_xml_parser_clears_reserved_section_content():
    xml = """
    <DIV5 N="91" TYPE="PART">
      <HEAD>PART 91—GENERAL OPERATING AND FLIGHT RULES</HEAD>
      <DIV8 N="91.20" TYPE="SECTION">
        <HEAD>§ 91.20 [Reserved]</HEAD>
      </DIV8>
    </DIV5>
    """

    part = parse_ecfr_part_xml(xml, 91, 14, "2026-08-11")

    assert part["sections"][0] == {
        "section": "91.20",
        "title": "[Reserved]",
        "content": "",
        "figures": [],
    }


def test_ecfr_xml_parser_uses_final_heading_for_reserved_sections():
    xml = """
    <DIV5 N="1544" TYPE="PART">
      <HEAD>PART 1544-AIRCRAFT OPERATOR SECURITY</HEAD>
      <DIV8 N="1544.3" TYPE="SECTION">
        <HEAD>§ 1544.3</HEAD>
        <HEAD>§ 1544.3 [Reserved]</HEAD>
      </DIV8>
    </DIV5>
    """

    part = parse_ecfr_part_xml(xml, 1544, 49, "2026-08-07")

    assert part["sections"][0] == {
        "section": "1544.3",
        "title": "[Reserved]",
        "content": "",
        "figures": [],
    }


def test_ecfr_xml_parser_preserves_image_only_appendix():
    xml = """
    <DIV5 N="36" TYPE="PART">
      <HEAD>PART 36—NOISE STANDARDS</HEAD>
      <DIV9 N="Appendix A to Part 36" TYPE="APPENDIX">
        <HEAD>Appendix A to Part 36—Aircraft Noise Measurement</HEAD>
        <img src="/graphics/er08jy02.000.gif" alt="Microphone sound incidence angles"/>
      </DIV9>
    </DIV5>
    """

    part = parse_ecfr_part_xml(xml, 36, 14, "2026-08-11")

    assert part["appendices"] == [
        {
            "appendix": "Appendix A to Part 36",
            "title": "Appendix A to Part 36-Aircraft Noise Measurement",
            "content": "",
            "figures": [
                {
                    "src": "part36/er08jy02.000.gif",
                    "alt": "Microphone sound incidence angles",
                    "caption": "",
                    "originalUrl": "https://www.ecfr.gov/graphics/er08jy02.000.gif",
                }
            ],
        }
    ]


def test_ecfr_xml_parser_keeps_nested_images_with_owner_and_excludes_unowned_images():
    xml = """
    <DIV5 N="25" TYPE="PART">
      <HEAD>PART 25—TRANSPORT CATEGORY AIRPLANES</HEAD>
      <img src="/graphics/part-chrome.gif"/>
      <DIV6 N="B" TYPE="SUBPART">
        <HEAD>Subpart B—Flight</HEAD>
        <img src="/graphics/subpart-chrome.gif"/>
        <DIV8 N="25.103" TYPE="SECTION">
          <HEAD>§ 25.103 Stall speed.</HEAD>
          <DIV>
            <TCAP>Figure 1 to paragraph (a)</TCAP>
            <img src="/graphics/er26no02.001.gif"/>
          </DIV>
        </DIV8>
      </DIV6>
      <DIV9 N="Appendix A to Part 25" TYPE="APPENDIX">
        <HEAD>Appendix A to Part 25—Design requirements</HEAD>
        <DIV>
          <MATH><img src="/graphics/ec28se91.035.gif"/></MATH>
        </DIV>
      </DIV9>
    </DIV5>
    """

    part = parse_ecfr_part_xml(xml, 25, 14, "2026-08-11")

    section_figures = part["subparts"][0]["sections"][0]["figures"]
    appendix_figures = part["appendices"][0]["figures"]
    assert section_figures == [
        {
            "src": "part25/er26no02.001.gif",
            "alt": "Figure 1 to paragraph (a)",
            "caption": "Figure 1 to paragraph (a)",
            "originalUrl": "https://www.ecfr.gov/graphics/er26no02.001.gif",
        }
    ]
    assert appendix_figures == [
        {
            "src": "part25/ec28se91.035.gif",
            "alt": "Equation 1 in Appendix A to Part 25-Design requirements",
            "caption": "",
            "originalUrl": "https://www.ecfr.gov/graphics/ec28se91.035.gif",
        }
    ]
    all_original_urls = {figure["originalUrl"] for figure in section_figures + appendix_figures}
    assert all("chrome" not in url for url in all_original_urls)


def test_far_image_cleanup_removes_only_unreferenced_files(tmp_path, monkeypatch):
    monkeypatch.setattr(crawl_far, "IMAGES_DIR", tmp_path)
    referenced = tmp_path / "part25" / "current.gif"
    stale = tmp_path / "part25" / "stale.gif"
    stale_other_part = tmp_path / "part36" / "stale.gif"
    for path in (referenced, stale, stale_other_part):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"image")

    crawl_far.remove_unused_far_images({"part25/current.gif"})

    assert referenced.is_file()
    assert not stale.exists()
    assert not stale_other_part.exists()
    assert not stale_other_part.parent.exists()


def test_far_image_download_uses_official_gpo_graphics_archive(tmp_path, monkeypatch):
    image_buffer = BytesIO()
    Image.new("RGB", (2, 2), "white").save(image_buffer, format="GIF")
    archive_buffer = BytesIO()
    with zipfile.ZipFile(archive_buffer, "w") as archive:
        archive.writestr("graphics/er27au24.002.gif", image_buffer.getvalue())

    requested_urls = []

    class Response:
        content = archive_buffer.getvalue()

        @staticmethod
        def raise_for_status():
            return None

    def fake_get(url, **_kwargs):
        requested_urls.append(url)
        return Response()

    crawl_far._govinfo_graphics_archive.cache_clear()
    monkeypatch.setattr(crawl_far, "REQUEST_DELAY", 0)
    monkeypatch.setattr(crawl_far.requests, "get", fake_get)
    output = tmp_path / "er27au24.002.gif"

    crawl_far.download_image("https://www.ecfr.gov/graphics/er27au24.002.gif", output, 14)

    assert output.is_file()
    assert crawl_far._image_is_valid(output.read_bytes())
    assert requested_urls == [
        "https://www.govinfo.gov/bulkdata/ECFR/title-14/ECFR-title14-graphics.zip"
    ]
    crawl_far._govinfo_graphics_archive.cache_clear()


def test_latest_ecfr_date_uses_complete_version_metadata(monkeypatch):
    class Response:
        @staticmethod
        def raise_for_status():
            return None

        @staticmethod
        def json():
            return {
                "content_versions": [{"date": "2026-07-24"}],
                "meta": {"latest_issue_date": "2026-10-15", "total_pages": "16"},
            }

    monkeypatch.setattr(crawl_far, "REQUEST_DELAY", 0)
    monkeypatch.setattr(crawl_far.requests, "get", lambda *_args, **_kwargs: Response())

    assert crawl_far.get_latest_ecfr_date(14) == "2026-10-15"


def test_toc_fetch_failure_stops_crawl(monkeypatch):
    import pytest
    import requests

    def unavailable(*_args, **_kwargs):
        raise requests.HTTPError("503 Service Unavailable")

    monkeypatch.setattr(crawl_far, "REQUEST_DELAY", 0)
    monkeypatch.setattr(crawl_far.requests, "get", unavailable)

    with pytest.raises(requests.HTTPError, match="503"):
        crawl_far.get_ecfr_toc(14)


def test_failed_part_does_not_publish_partial_snapshot(tmp_path, monkeypatch):
    import pytest

    index = tmp_path / "index.json"
    index.write_text('{"previous": true}', encoding="utf-8")
    part_file = tmp_path / "part1.json"
    part_file.write_text('{"previous": true}', encoding="utf-8")
    monkeypatch.setattr(crawl_far, "DATA_DIR", tmp_path)
    monkeypatch.setattr(crawl_far, "get_latest_ecfr_date", lambda _title: "2026-10-15")
    monkeypatch.setattr(
        crawl_far,
        "get_ecfr_toc",
        lambda title: [
            {"part": part, "cfr_title": str(title), "title": "Test"}
            for part in ([1] if title == 14 else [172, 175, 830, 1544, 1552])
        ],
    )

    def crawl_part(part_num, *_args, **_kwargs):
        if part_num == 1552:
            return None
        return {"part": part_num, "sections": [], "subparts": [], "appendices": []}

    monkeypatch.setattr(crawl_far, "crawl_ecfr_part", crawl_part)

    with pytest.raises(RuntimeError, match="1552"):
        crawl_far.main()

    assert json.loads(index.read_text()) == {"previous": True}
    assert json.loads(part_file.read_text()) == {"previous": True}
    assert not (tmp_path / "part172.json").exists()


def test_truncated_xml_is_rejected_instead_of_recovered():
    import pytest

    xml = '<DIV5 N="91" TYPE="PART"><HEAD>PART 91-General</HEAD><DIV8 N="91.220" TYPE="SECTION">'

    with pytest.raises(ValueError, match="XML"):
        parse_ecfr_part_xml(xml, 91, 14, "2026-10-15")


def test_gpo_table_normalizes_multiline_cells_and_preserves_row_boundaries():
    xml = """
    <DIV5 N="91" TYPE="PART">
      <HEAD>PART 91-General</HEAD>
      <DIV8 N="91.220" TYPE="SECTION">
        <HEAD>§ 91.220 Radio Altimeter Systems.</HEAD>
        <P>Operate in the interference environment defined below:</P>
        <DIV class="gpotbl_div"><TABLE class="gpo_table">
          <CAPTION><P>Table 1 to Paragraph (b)</P></CAPTION>
          <THEAD><TR>
            <TH>Frequency range<br/>(MHz)</TH>
            <TH>Power flux-<br/>density, single<br/>polarization,<br/>root mean<br/>square<br/>(dBW/m<sup>2</sup>/MHz)</TH>
          </TR></THEAD>
          <TBODY>
            <TR><TD>3000 ≤ f &lt; 4000</TD><TD><P>9.5</P></TD></TR>
            <TR><TD>4200 ≤ f ≤ 4400</TD><TD>−82</TD></TR>
          </TBODY>
        </TABLE></DIV>
        <CITA>[Amdt.\n91-321E, 85 FR 45091, July 27, 2020]</CITA>
      </DIV8>
    </DIV5>
    """

    content = parse_ecfr_part_xml(xml, 91, 14, "2026-10-15")["sections"][0]["content"]

    assert content == (
        "Operate in the interference environment defined below:\n\n"
        "Table 1 to Paragraph (b)\n\n"
        "[TABLE]\n"
        "| Frequency range (MHz) | Power flux-density, single polarization, root mean square (dBW/m2/MHz) |\n\n"
        "| 3000 ≤ f < 4000 | 9.5 |\n\n"
        "| 4200 ≤ f ≤ 4400 | -82 |\n"
        "[/TABLE]\n\n"
        "[Amdt. 91-321E, 85 FR 45091, July 27, 2020]"
    )


def test_gpo_table_retains_spanned_headers_and_empty_matrix_cells():
    xml = """
    <DIV5 N="175" TYPE="PART">
      <HEAD>PART 175-Hazardous materials</HEAD>
      <DIV8 N="175.78" TYPE="SECTION">
        <HEAD>§ 175.78 Stowage compatibility.</HEAD>
        <TABLE class="gpo_table">
          <THEAD>
            <TR><TH rowspan="2">Hazard label</TH><TH colspan="2">Class or division</TH></TR>
            <TR><TH>1</TH><TH>2.1</TH></TR>
          </THEAD>
          <TBODY>
            <TR><TD>1</TD><TD>Note 1</TD><TD>Note 2</TD></TR>
            <TR><TD>2.1</TD><TD></TD><TD>X</TD></TR>
          </TBODY>
        </TABLE>
      </DIV8>
    </DIV5>
    """

    content = parse_ecfr_part_xml(xml, 175, 49, "2026-10-13")["sections"][0]["content"]

    assert content == (
        "[TABLE]\n"
        "| Hazard label | Class or division / 1 | Class or division / 2.1 |\n\n"
        "| 1 | Note 1 | Note 2 |\n\n"
        "| 2.1 | | X |\n"
        "[/TABLE]"
    )


def test_gpo_table_escapes_literal_pipes_without_adding_columns():
    xml = """
    <DIV5 N="25" TYPE="PART">
      <HEAD>PART 25-Airworthiness</HEAD>
      <DIV8 N="25.1" TYPE="SECTION">
        <HEAD>§ 25.1 Applicability.</HEAD>
        <TABLE><TR><TH>Expression</TH><TH>Limit</TH></TR>
          <TR><TD>| x |</TD><TD>1</TD></TR>
        </TABLE>
      </DIV8>
    </DIV5>
    """

    content = parse_ecfr_part_xml(xml, 25, 14, "2026-10-15")["sections"][0]["content"]

    assert content == "[TABLE]\n| Expression | Limit |\n\n| \\| x \\| | 1 |\n[/TABLE]"


def test_subpart_appendix_is_kept_with_its_content_and_tables():
    xml = """
    <DIV5 N="291" TYPE="PART">
      <HEAD>PART 291-Domestic cargo transportation</HEAD>
      <DIV6 N="E" TYPE="SUBPART">
        <HEAD>Subpart E-Reporting requirements</HEAD>
        <DIV8 N="291.45" TYPE="SECTION">
          <HEAD>§ 291.45 General.</HEAD><P>Report as provided in appendix A to this subpart.</P>
        </DIV8>
        <DIV7 N="Appendix A to Subpart E of Part 291" TYPE="APPENDIX">
          <HEAD>Appendix A to Subpart E of Part 291-Instructions</HEAD>
          <P>Follow these reporting instructions.</P>
          <TABLE><TR><TH>Report</TH><TH>Instructions</TH></TR>
            <TR><TD>Traffic</TD><TD>Submit quarterly</TD></TR>
          </TABLE>
          <TABLE><TR><TH>Item</TH><TH>Code</TH></TR>
            <TR><TD>Departures</TD><TD>510</TD></TR>
          </TABLE>
        </DIV7>
      </DIV6>
    </DIV5>
    """

    part = parse_ecfr_part_xml(xml, 291, 14, "2026-10-15")

    assert part["subparts"][0]["sections"][0]["section"] == "291.45"
    assert len(part["appendices"]) == 1
    appendix = part["appendices"][0]
    assert appendix["appendix"] == "Appendix A to Subpart E of Part 291"
    assert appendix["title"] == "Appendix A to Subpart E of Part 291-Instructions"
    assert "Follow these reporting instructions." in appendix["content"]
    assert appendix["content"].count("[TABLE]") == 2
    assert "| Traffic | Submit quarterly |" in appendix["content"]
    assert "| Departures | 510 |" in appendix["content"]


def test_subpart_appendices_with_distinct_original_identifiers_are_not_merged():
    identifiers = ["Appendix to Subpart U of Part 93", "Appendix A to Subpart U of Part 93"]
    xml = (
        '<DIV5 N="93" TYPE="PART"><HEAD>PART 93-Special air traffic rules</HEAD>'
        '<DIV6 N="U" TYPE="SUBPART"><HEAD>Subpart U-Special flight rules</HEAD>'
        + "".join(
            f'<DIV9 N="{identifier}" TYPE="APPENDIX"><HEAD>{identifier}</HEAD>'
            f"<P>Instructions for {identifier}.</P></DIV9>"
            for identifier in identifiers
        )
        + "</DIV6></DIV5>"
    )

    part = parse_ecfr_part_xml(xml, 93, 14, "2026-10-15")

    assert [appendix["appendix"] for appendix in part["appendices"]] == identifiers
    assert [appendix["content"] for appendix in part["appendices"]] == [
        f"Instructions for {identifier}." for identifier in identifiers
    ]
