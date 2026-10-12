# ruff: noqa: E402

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
    all_original_urls = {
        figure["originalUrl"] for figure in section_figures + appendix_figures
    }
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

    crawl_far.download_image(
        "https://www.ecfr.gov/graphics/er27au24.002.gif", output, 14
    )

    assert output.is_file()
    assert crawl_far._image_is_valid(output.read_bytes())
    assert requested_urls == [
        "https://www.govinfo.gov/bulkdata/ECFR/title-14/ECFR-title14-graphics.zip"
    ]
    crawl_far._govinfo_graphics_archive.cache_clear()
