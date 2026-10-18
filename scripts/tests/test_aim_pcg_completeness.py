# ruff: noqa: E402

import json
import subprocess
import sys
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import crawl_aim
from crawl_pcg import parse_official_pcg_page

SVG_FIGURE = b"""<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in"
viewBox="0 0 200 100"><rect x="10" y="10" width="180" height="80" fill="black"/></svg>"""


def test_svg_figure_is_downloaded_as_visible_png(tmp_path, monkeypatch):
    url = crawl_aim.BASE_URL + "images/recovered.svg"
    monkeypatch.setattr(crawl_aim, "IMAGE_CACHE", {url: SVG_FIGURE})
    monkeypatch.setattr(crawl_aim, "IMAGES_DIR", tmp_path)
    section = crawl_aim.parse_aim_section(
        '<article><h4 class="paragraph-title" id="6-3-3">6-3-3. Ditching</h4>'
        "<figure><figcaption>FIG 6-3-1 Ditch heading</figcaption>"
        '<img src="images/recovered.svg" alt="Wind and swell"></figure></article>',
        "6-3-3",
        crawl_aim.BASE_URL + "chap6_section_3.html",
        6,
    )
    figure = section["figures"][0]
    assert figure["src"] == "chapter6/section-6-3-3-img-1.png"
    assert figure["originalUrl"] == url
    image_bytes = (tmp_path / figure["src"]).read_bytes()
    with Image.open(BytesIO(image_bytes)) as image:
        assert image.format == "PNG"
        assert image.size == (1600, 800)
    assert crawl_aim.image_has_visible_content(image_bytes)


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (b"<html><body>Access denied</body></html>", "Invalid AIM image"),
        (b"not an image", "Invalid AIM image"),
        (
            b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"/>',
            "Expected AIM figure is blank",
        ),
    ],
)
def test_expected_image_failure_cannot_silently_drop_or_reuse_figure(
    tmp_path, monkeypatch, content, message
):
    url = "https://www.faa.gov/figure.svg"
    target = tmp_path / "figure.png"
    target.write_bytes(crawl_aim.normalize_image(SVG_FIGURE))
    original = target.read_bytes()
    monkeypatch.setattr(crawl_aim, "IMAGE_CACHE", {url: content})
    with pytest.raises(RuntimeError, match=message):
        crawl_aim.download_image(url, target)
    assert target.read_bytes() == original


def test_svg_cannot_read_external_resources():
    with pytest.raises(ValueError, match="external resource"):
        crawl_aim.normalize_image(
            b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">'
            b'<image href="file:///etc/passwd"/></svg>'
        )


def test_complex_svg_cannot_hang_a_refresh(monkeypatch):
    def timeout(*_args, **_kwargs):
        raise subprocess.TimeoutExpired("resvg_py", 30)

    monkeypatch.setattr(crawl_aim.subprocess, "run", timeout)
    with pytest.raises(ValueError, match="rendering exceeded 30 seconds"):
        crawl_aim.normalize_image(SVG_FIGURE)


def test_duplicated_hand_signal_source_uses_distinct_verified_faa_figures(tmp_path, monkeypatch):
    cache = {}
    figure_html = []
    for label, (figure_id, filename) in crawl_aim.HAND_SIGNAL_FIGURES.items():
        encoded = BytesIO()
        Image.new("RGB", (20, 10), "black").save(encoded, format="WEBP")
        url = "https://www.faa.gov/air_traffic/publications/aim_html/assets/img/" + filename
        cache[url] = encoded.getvalue()
        figure_html.append(
            f"<figure><figcaption>FIG 6-5-3 {label}</figcaption>"
            f'<img src="images/aim0605_fig197_recovered.svg" alt="{label}"></figure>'
        )
    monkeypatch.setattr(crawl_aim, "IMAGE_CACHE", cache)
    monkeypatch.setattr(crawl_aim, "IMAGES_DIR", tmp_path)

    def resolve(_section, title, url, _page):
        number = crawl_aim.HAND_SIGNAL_FIGURES[title][0]
        return SimpleNamespace(
            number=number,
            title=title,
            kind="FIG",
            page=515 if number == "6-5-1" else 516,
            caption=f"FIG {number} {title}",
            asset_url=url,
        )

    resolver = SimpleNamespace(
        catalog=SimpleNamespace(source_sha256=crawl_aim.VERIFIED_ASSET_REPAIR_PDF_SHA256),
        resolve=resolve,
    )
    section = crawl_aim.parse_aim_section(
        '<article><h4 class="paragraph-title" id="6-5-3">6-5-3. Hand Signals</h4>'
        + "".join(figure_html)
        + "</article>",
        "6-5-3",
        crawl_aim.BASE_URL + "chap6_section_5.html",
        6,
        figure_resolver=resolver,
    )
    assert [figure["caption"] for figure in section["figures"]] == [
        "FIG 6-5-1 Recommend Evacuation",
        "FIG 6-5-2 Recommend Stop",
        "FIG 6-5-3 Emergency Contained",
    ]
    assert {figure["originalUrl"] for figure in section["figures"]} == set(cache)
    assert "FIG 6-5-1 Recommend Evacuation" in section["content"]
    assert "FIG 6-5-2 Recommend Stop" in section["content"]
    for figure in section["figures"]:
        with Image.open(tmp_path / figure["src"]) as image:
            assert image.format == "PNG"


def test_images_in_tables_survive_table_extraction(monkeypatch):
    monkeypatch.setattr(crawl_aim, "download_image", lambda *_args: True)
    section = crawl_aim.parse_aim_section(
        '<article><h4 class="paragraph-title" id="1-1-1">1-1-1. General</h4>'
        '<table><tr><td><img src="images/navigation.png" alt="Navigation diagram">'
        "A table figure</td></tr></table></article>",
        "1-1-1",
        crawl_aim.BASE_URL + "chap1_section_1.html",
        1,
    )
    assert len(section["tables"]) == 1
    assert section["figures"][0]["alt"] == "Navigation diagram"


def test_supplement_ignores_tracking_pixel_outside_publication_article(monkeypatch):
    downloaded = []
    monkeypatch.setattr(
        crawl_aim, "download_image", lambda url, _path: downloaded.append(url) or True
    )
    section = crawl_aim.parse_aim_section(
        "<html><body><article><h1>Flight Plan Form</h1>"
        '<img src="images/form.png" alt="Flight plan form"></article>'
        '<noscript><img src="https://www.faa.gov/akam/13/pixel_46033d60" alt=""></noscript>'
        '<img src="https://www.faa.gov/akam/13/pixel_46033d60" alt="">'
        "</body></html>",
        "A-1",
        crawl_aim.BASE_URL + "appendix_1.html",
        0,
    )
    assert downloaded == [crawl_aim.BASE_URL + "images/form.png"]
    assert len(section["figures"]) == 1


def test_appendix_excludes_verified_blank_export_footer_but_keeps_form_images(monkeypatch):
    downloaded = []
    monkeypatch.setattr(
        crawl_aim, "download_image", lambda url, _path: downloaded.append(url) or True
    )
    section = crawl_aim.parse_aim_section(
        "<article><h1>Bird/Other Wildlife Strike Report</h1>"
        '<img src="images/aimapd1_floating1.png" alt="Strike report front">'
        '<img src="images/aimapd1_BlankFooter0.png" alt="aimapd1_BlankFooter0">'
        '<img src="images/aimapd1_BlankFooter0.png" alt="aimapd1_BlankFooter0">'
        '<img src="images/aimapd1_floating0.png" alt="Strike report back"></article>',
        "A-1",
        crawl_aim.BASE_URL + "appendix_1.html",
        0,
    )
    assert downloaded == [
        crawl_aim.BASE_URL + "images/aimapd1_floating1.png",
        crawl_aim.BASE_URL + "images/aimapd1_floating0.png",
    ]
    assert len(section["figures"]) == 2
    assert "BlankFooter" not in section["content"]


def test_pdf_verified_caption_repairs_blank_asset_and_retains_source_provenance(monkeypatch):
    replacement = (
        "https://www.faa.gov/air_traffic/publications/aim_html/assets/img/aim_fig_5_3_2.webp"
    )
    original = crawl_aim.BASE_URL + "images/aim0503_Auto4.png"
    verified = SimpleNamespace(
        asset_url=replacement,
        number="5-3-2",
        kind="FIG",
        page=384,
        title="Holding Patterns",
        label="FIG 5-3-2",
        caption="FIG 5-3-2: Holding Patterns",
    )
    resolver = SimpleNamespace(
        catalog=SimpleNamespace(source_sha256=crawl_aim.VERIFIED_ASSET_REPAIR_PDF_SHA256),
        resolve_mirror_asset=lambda *_args: verified,
    )
    downloaded = []
    monkeypatch.setattr(
        crawl_aim, "download_image", lambda url, _path: downloaded.append(url) or True
    )
    section = crawl_aim.parse_aim_section(
        '<article><h4 class="paragraph-title" id="5-3-8">5-3-8. Holding</h4>'
        '<figure><figcaption><span class="fig-number">FIG 5-3-8</span>'
        '<span class="fig-title">Holding Patterns</span></figcaption>'
        '<img src="images/aim0503_Auto4.png" alt="Holding Patterns"></figure></article>',
        "5-3-8",
        crawl_aim.BASE_URL + "chap5_section_3.html",
        5,
        figure_resolver=resolver,
    )
    assert downloaded == [replacement]
    assert "FIG 5-3-2: Holding Patterns" in section["content"]
    figure = section["figures"][0]
    assert figure["originalUrl"] == replacement
    assert figure["sourceImageUrl"] == original
    assert figure["number"] == "5-3-2"
    assert figure["sourcePdfPage"] == 384
    assert figure["src"].endswith(".png")


def test_future_pdf_edition_cannot_reuse_unverified_older_mirror_art():
    resolver = SimpleNamespace(catalog=SimpleNamespace(source_sha256="different-edition"))
    with pytest.raises(ValueError, match="fallback needs revalidation"):
        crawl_aim.parse_aim_section(
            '<article><h4 class="paragraph-title" id="5-3-8">5-3-8. Holding</h4>'
            '<figure><figcaption><span class="fig-title">Holding Patterns</span></figcaption>'
            '<img src="images/aim0503_Auto4.png" alt="Holding Patterns"></figure></article>',
            "5-3-8",
            crawl_aim.BASE_URL + "chap5_section_3.html",
            5,
            figure_resolver=resolver,
        )


def test_untitled_figure_uses_source_caption_for_verified_filename_resolution(monkeypatch):
    def resolve(_section, title, _image, _page):
        assert title == "FIG 5-4-9"
        return SimpleNamespace(
            number="5-4-16",
            kind="FIG",
            page=431,
            title="",
            label="FIG 5-4-16",
            caption="FIG 5-4-16",
        )

    monkeypatch.setattr(crawl_aim, "download_image", lambda *_args: True)
    section = crawl_aim.parse_aim_section(
        '<article><h4 class="paragraph-title" id="5-4-9">5-4-9. Approaches</h4>'
        '<figure><figcaption><span class="fig-number">FIG 5-4-9</span></figcaption>'
        '<img src="images/aim0504_At_Anchor4.png" alt="Figure 2"></figure></article>',
        "5-4-9",
        crawl_aim.BASE_URL + "chap5_section_4.html",
        5,
        figure_resolver=SimpleNamespace(resolve=resolve),
    )
    assert section["figures"][0]["caption"] == "FIG 5-4-16"
    assert section["figures"][0]["alt"] == "FIG 5-4-16"


def test_missing_section_heading_does_not_copy_the_whole_page():
    with pytest.raises(ValueError, match="1-1-2 is missing"):
        crawl_aim.parse_aim_section(
            '<article><h4 class="paragraph-title" id="1-1-1">1-1-1. General</h4>'
            "<p>Another section.</p></article>",
            "1-1-2",
            crawl_aim.BASE_URL + "chap1_section_1.html",
            1,
        )


def test_incomplete_crawl_preserves_existing_chapter_data(tmp_path, monkeypatch):
    index = crawl_aim.AIM_INDEX_URL
    section_one = crawl_aim.BASE_URL + "chap1_section_1.html"
    section_two = crawl_aim.BASE_URL + "chap2_section_1.html"
    pages = {
        index: '<p>Effective: 7/9/26</p><a href="chap_1.html">Chapter 1</a>'
        '<a href="chap_2.html">Chapter 2</a><ul class="paragraph-list">'
        '<li><a href="chap1_section_1.html#1-1-1">1-1-1. General</a></li>'
        '<li><a href="chap2_section_1.html#2-1-1">2-1-1. Lights</a></li></ul>',
        crawl_aim.BASE_URL
        + "chap_1.html": '<a href="chap1_section_1.html#1-1-1">1-1-1. General</a>',
        crawl_aim.BASE_URL
        + "chap_2.html": '<a href="chap2_section_1.html#2-1-1">2-1-1. Lights</a>',
        section_one: '<article><h4 class="paragraph-title" id="1-1-1">1-1-1. General</h4>'
        "<p>Refreshed content.</p></article>",
        section_two: None,
    }
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    original = {"sections": [{"content": "Previously complete content."}]}
    (data_dir / "chapter1.json").write_text(json.dumps(original))
    monkeypatch.setattr(crawl_aim, "fetch_page", lambda url: pages[url])
    monkeypatch.setattr(crawl_aim, "DATA_DIR", data_dir)
    monkeypatch.setattr(crawl_aim, "IMAGES_DIR", tmp_path / "images")
    monkeypatch.setattr(crawl_aim, "tqdm", lambda items, **_kwargs: items)
    with pytest.raises(RuntimeError, match="Could not fetch AIM section 2-1-1"):
        crawl_aim.main()
    assert json.loads((data_dir / "chapter1.json").read_text()) == original
    assert not (data_dir / "index.json").exists()


def test_empty_dfn_keeps_visible_braking_action_entry():
    terms = parse_official_pcg_page(
        '<article class="pcg-content"><p class="glossary-term-entry">'
        'BRAKING ACTION (GOOD, POOR, OR NIL)-<dfn class="term-name"> </dfn>'
        "A report of airport movement area conditions.</p></article>"
    )
    assert terms == [
        {
            "term": "BRAKING ACTION (GOOD, POOR, OR NIL)",
            "definition": "A report of airport movement area conditions.",
        }
    ]


def test_colon_term_is_separate_but_icing_labels_remain_in_definition():
    terms = parse_official_pcg_page(
        '<article class="pcg-content"><p class="glossary-term-entry">'
        '<dfn class="term-name">AREA NAVIGATION</dfn>- Navigation by fixes.</p>'
        '<p class="glossary-term-entry">AREA NAVIGATION APPROACH CONFIGURATION:</p>'
        '<ol class="glossary-sub-list"><li>STANDARD T- An approach design.</li></ol>'
        '<p class="glossary-term-entry"><dfn class="term-name">ICING</dfn>- Ice accumulation.</p>'
        '<p class="glossary-term-entry">Types of icing are:</p>'
        '<ol class="glossary-sub-list"><li>Rime ice.</li></ol></article>'
    )
    assert [term["term"] for term in terms] == [
        "AREA NAVIGATION",
        "AREA NAVIGATION APPROACH CONFIGURATION",
        "ICING",
    ]
    assert terms[1]["definition"] == "STANDARD T- An approach design."
    assert "Types of icing are: Rime ice." in terms[2]["definition"]


@pytest.mark.parametrize(
    "html",
    ["<html><p>Access denied</p></html>", '<article class="pcg-content"></article>'],
)
def test_invalid_pcg_page_cannot_be_published_as_an_empty_letter(html):
    with pytest.raises(ValueError, match="FAA PCG page"):
        parse_official_pcg_page(html)
