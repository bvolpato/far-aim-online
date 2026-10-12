import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"
ANDROID_DATA_DIR = ROOT_DIR / "mobile/android/app/src/main/assets"
IOS_DATA_DIR = ROOT_DIR / "mobile/ios/FARAIMPro/Resources/data"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def far_sections(part: dict) -> list[dict]:
    sections = list(part.get("sections", []))
    for subpart in part.get("subparts", []):
        sections.extend(subpart.get("sections", []))
    return sections


def far_figures(part: dict) -> list[dict]:
    references = far_sections(part) + list(part.get("appendices", []))
    return [figure for reference in references for figure in reference.get("figures", [])]


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def expected_mobile_files() -> dict[Path, Path]:
    files: dict[Path, Path] = {}
    patterns = (
        "far/*.json",
        "aim/chapter*.json",
        "aim/index.json",
        "aim/pcg.json",
        "quizzes/*.json",
        "flashcards/*.json",
        "advisory-circulars/**/*.json",
        "study-paths.json",
        "source-status.json",
    )
    for pattern in patterns:
        for path in DATA_DIR.glob(pattern):
            files[path.relative_to(DATA_DIR)] = path
    for path in (ROOT_DIR / "web/public/far/images").rglob("*"):
        if path.is_file():
            files[Path("far/images") / path.relative_to(ROOT_DIR / "web/public/far/images")] = path
    for path in (ROOT_DIR / "web/public/aim/images").rglob("*"):
        if path.is_file():
            files[Path("aim/images") / path.relative_to(ROOT_DIR / "web/public/aim/images")] = path
    files[Path("search/inverted-index-ac.json")] = (
        ROOT_DIR / "web/public/inverted-index-ac.json"
    )
    return files


def assert_mobile_bundle_matches_shared_data(bundle_dir: Path) -> None:
    expected = expected_mobile_files()
    actual = {
        path.relative_to(bundle_dir): path
        for path in bundle_dir.rglob("*")
        if path.is_file()
    }

    assert actual.keys() == expected.keys()
    for relative_path, source_path in expected.items():
        assert digest(actual[relative_path]) == digest(source_path), str(relative_path)


def test_reference_catalogs_match_structured_source_status():
    source_status = load_json(DATA_DIR / "source-status.json")
    sources = {source["id"]: source for source in source_status["sources"]}

    far_index = load_json(DATA_DIR / "far/index.json")
    far_parts = [
        load_json(DATA_DIR / "far" / f"part{item['part']}.json")
        for item in far_index["parts"]
    ]
    assert len(far_parts) == len({part["part"] for part in far_parts})
    assert sources["far"]["itemCount"] == len(far_parts)
    assert sources["far"]["sectionCount"] == sum(len(far_sections(part)) for part in far_parts)
    assert far_index["totalFigures"] == sum(len(far_figures(part)) for part in far_parts)
    for item, part in zip(far_index["parts"], far_parts, strict=True):
        assert item["figureCount"] == len(far_figures(part))
        sections = far_sections(part)
        identifiers = [section["section"] for section in sections]
        assert len(identifiers) == len(set(identifiers)), part["part"]
        assert all("website feedback" not in section["content"].lower() for section in sections)
        appendices = part.get("appendices", [])
        appendix_ids = [appendix["appendix"] for appendix in appendices]
        assert len(appendix_ids) == len(set(appendix_ids)), part["part"]
        assert all(appendix["title"].strip() for appendix in appendices)
        assert all(
            appendix["content"].strip()
            or appendix.get("figures")
            or "reserved" in appendix["title"].lower()
            for appendix in appendices
        )
        for figure in far_figures(part):
            assert (figure.get("alt") or figure.get("caption") or "").strip()
            figure_path = ROOT_DIR / "web/public/far/images" / figure["src"]
            assert figure_path.is_file(), figure["src"]
            with Image.open(figure_path) as image:
                image.verify()

    referenced_far_figures = {
        figure["src"] for part in far_parts for figure in far_figures(part)
    }
    bundled_far_figures = {
        str(path.relative_to(ROOT_DIR / "web/public/far/images"))
        for path in (ROOT_DIR / "web/public/far/images").rglob("*")
        if path.is_file()
    }
    assert bundled_far_figures == referenced_far_figures

    aim_index = load_json(DATA_DIR / "aim/index.json")
    aim_chapters = [
        load_json(DATA_DIR / "aim" / f"chapter{item['chapter']}.json")
        for item in aim_index["chapters"]
    ]
    assert [chapter["chapter"] for chapter in aim_chapters] == list(range(0, 12))
    assert sources["aim"]["itemCount"] == len(aim_chapters)
    assert sources["aim"]["sectionCount"] == sum(
        len(chapter["sections"]) for chapter in aim_chapters
    )
    aim_figures = [
        figure["src"]
        for chapter in aim_chapters
        for section in chapter["sections"]
        for figure in section.get("figures", [])
    ]
    assert len(aim_figures) == aim_index["totalImages"]
    assert len(aim_figures) == len(set(aim_figures))
    bundled_aim_figures = {
        str(path.relative_to(ROOT_DIR / "web/public/aim/images"))
        for path in (ROOT_DIR / "web/public/aim/images").rglob("*")
        if path.is_file()
    }
    assert bundled_aim_figures == set(aim_figures)
    for figure in aim_figures:
        figure_path = ROOT_DIR / "web/public/aim/images" / figure
        assert figure_path.is_file(), figure
        with Image.open(figure_path) as image:
            image.verify()
    for chapter in aim_chapters:
        section_ids = [section["section"] for section in chapter["sections"]]
        assert len(section_ids) == len(set(section_ids)), chapter["chapter"]
        for section in chapter["sections"]:
            assert section["section"].strip() and section["title"].strip()
            for figure in section.get("figures", []):
                assert (figure.get("alt") or figure.get("caption") or "").strip()
            for table in section.get("tables", []):
                headers = table["headers"]
                assert headers
                assert all(len(row) == len(headers) for row in table["rows"])

    glossary = load_json(DATA_DIR / "aim/pcg.json")["terms"]
    assert len(glossary) == len({term["term"] for term in glossary})
    assert all(term["term"].strip() and term["definition"].strip() for term in glossary)
    assert all(
        not re.search(r"\((?:See|Refer)[^)]*\b[A-Z]+_[A-Z_]+", term["definition"])
        for term in glossary
    )
    assert sources["pcg"]["itemCount"] == len(glossary)

    circulars = load_json(DATA_DIR / "advisory-circulars/index.json")["items"]
    assert len(circulars) == len({item["id"] for item in circulars})
    assert sources["ac"]["itemCount"] == len(circulars)

    study_paths = load_json(DATA_DIR / "study-paths.json")["paths"]
    quizzes = [load_json(path) for path in sorted((DATA_DIR / "quizzes").glob("*.json"))]
    decks = [load_json(path) for path in sorted((DATA_DIR / "flashcards").glob("*.json"))]
    assert sources["study"]["itemCount"] == len(study_paths)
    assert sources["study"]["questionCount"] == sum(len(quiz["questions"]) for quiz in quizzes)
    assert sources["study"]["cardCount"] == sum(len(deck["cards"]) for deck in decks)


def test_every_advisory_circular_payload_is_valid_and_referenced_once():
    circulars = load_json(DATA_DIR / "advisory-circulars/index.json")["items"]
    search_index = load_json(ROOT_DIR / "web/public/inverted-index-ac.json")
    indexed_document_ids = {
        document_id
        for document_ids in search_index.values()
        for document_id in document_ids
    }
    assert indexed_document_ids == set(range(len(circulars)))
    referenced_paths: set[str] = set()

    for circular in circulars:
        document_url = urlparse(circular["documentUrl"])
        assert document_url.scheme == "https"
        assert document_url.netloc == "www.faa.gov"
        if circular.get("pdfUrl"):
            pdf_url = urlparse(circular["pdfUrl"])
            assert pdf_url.scheme == "https"
            assert pdf_url.netloc == "www.faa.gov"

        content_path = circular.get("contentPath")
        if circular["contentStatus"] == "unavailable":
            assert content_path is None
            continue

        assert content_path
        assert content_path not in referenced_paths
        referenced_paths.add(content_path)

        content = load_json(DATA_DIR / "advisory-circulars" / content_path)
        assert content["id"] == circular["id"]
        assert content["number"] == circular["number"]
        assert content["status"] == circular["contentStatus"]
        assert re.fullmatch(r"[0-9a-f]{64}", content["sha256"])
        assert content["wordCount"] > 0
        assert content["pages"]

        page_numbers = [page["page"] for page in content["pages"]]
        assert page_numbers == sorted(set(page_numbers))
        assert all(0 < page <= content["pageCount"] for page in page_numbers)
        assert all(page["text"].strip() for page in content["pages"])
        assert circular["extractedPageCount"] == content["extractedPageCount"]
        if content["status"] == "partial":
            assert content["extractedPageCount"] == len(content["pages"])
            assert content["extractedPageCount"] < content["pageCount"]
        if content["status"] == "parsed":
            assert page_numbers == list(range(1, content["pageCount"] + 1))

    actual_paths = {
        str(path.relative_to(DATA_DIR / "advisory-circulars"))
        for path in (DATA_DIR / "advisory-circulars/content").glob("*.json")
    }
    assert referenced_paths == actual_paths


def test_study_material_identifiers_and_references_are_valid():
    quizzes = [load_json(path) for path in sorted((DATA_DIR / "quizzes").glob("*.json"))]
    decks = [load_json(path) for path in sorted((DATA_DIR / "flashcards").glob("*.json"))]
    study_paths = load_json(DATA_DIR / "study-paths.json")["paths"]
    far_parts = {item["part"] for item in load_json(DATA_DIR / "far/index.json")["parts"]}
    aim_chapters = {
        item["chapter"] for item in load_json(DATA_DIR / "aim/index.json")["chapters"]
    }

    quiz_ids = {quiz["id"] for quiz in quizzes}
    deck_ids = {deck["id"] for deck in decks}
    assert len(quiz_ids) == len(quizzes)
    assert len(deck_ids) == len(decks)

    for quiz in quizzes:
        question_ids = [question["id"] for question in quiz["questions"]]
        assert len(question_ids) == len(set(question_ids))
        assert quiz["questionCount"] == len(question_ids)
        for question in quiz["questions"]:
            assert 0 <= question["correctAnswer"] < len(question["options"])
            assert question["reference"].strip()

    for deck in decks:
        card_ids = [card["id"] for card in deck["cards"]]
        assert len(card_ids) == len(set(card_ids))
        assert deck["cardCount"] == len(card_ids)
        assert all(card["reference"].strip() for card in deck["cards"])

    path_ids = [path["id"] for path in study_paths]
    assert len(path_ids) == len(set(path_ids))
    for study_path in study_paths:
        assert set(study_path["quizIds"]) <= quiz_ids
        assert set(study_path["flashcardDeckIds"]) <= deck_ids
        for reference in study_path["references"]:
            if reference["type"] == "far":
                assert reference["part"] in far_parts
            else:
                assert reference["type"] == "aim"
                assert reference["chapter"] in aim_chapters


def test_mobile_bundles_are_byte_identical_to_shared_data():
    assert_mobile_bundle_matches_shared_data(ANDROID_DATA_DIR)
    assert_mobile_bundle_matches_shared_data(IOS_DATA_DIR)


def test_release_versions_and_store_claims_match_source_status():
    source_status = load_json(DATA_DIR / "source-status.json")
    app_version = source_status["appVersion"]
    ac_count = next(
        source["itemCount"] for source in source_status["sources"] if source["id"] == "ac"
    )

    web_package = load_json(ROOT_DIR / "web/package.json")
    assert web_package["version"] == app_version

    android_gradle = (ROOT_DIR / "mobile/android/app/build.gradle.kts").read_text(encoding="utf-8")
    android_version = re.search(r'versionName = "([^"]+)"', android_gradle)
    assert android_version and android_version.group(1) == app_version
    target_sdk = re.search(r"targetSdk = (\d+)", android_gradle)
    compile_sdk = re.search(r"compileSdk = (\d+)", android_gradle)
    assert target_sdk and int(target_sdk.group(1)) >= 36
    assert compile_sdk and int(compile_sdk.group(1)) >= int(target_sdk.group(1))

    ios_project = (ROOT_DIR / "mobile/ios/FARAIMPro.xcodeproj/project.pbxproj").read_text(
        encoding="utf-8"
    )
    ios_versions = set(re.findall(r"MARKETING_VERSION = ([^;]+);", ios_project))
    assert ios_versions == {app_version}

    expected_claim = f"{ac_count} current FAA Advisory Circular records"
    store_descriptions = (
        ROOT_DIR / "store/android/metadata/en-US/full_description.txt",
        ROOT_DIR / "store/ios/metadata/en-US/description.txt",
    )
    for description in store_descriptions:
        assert expected_claim in description.read_text(encoding="utf-8")


def test_mobile_privacy_packaging_matches_local_only_claims():
    android_manifest = ET.parse(
        ROOT_DIR / "mobile/android/app/src/main/AndroidManifest.xml"
    ).getroot()
    application = android_manifest.find("application")
    assert application is not None
    android_namespace = "{http://schemas.android.com/apk/res/android}"
    assert application.get(f"{android_namespace}allowBackup") == "false"
    assert application.get(f"{android_namespace}dataExtractionRules") == (
        "@xml/data_extraction_rules"
    )
    assert application.get(f"{android_namespace}fullBackupContent") == (
        "@xml/backup_rules"
    )

    backup_rules = ET.parse(
        ROOT_DIR / "mobile/android/app/src/main/res/xml/backup_rules.xml"
    ).getroot()
    legacy_domains = {"root", "file", "database", "sharedpref", "external"}
    assert {rule.get("domain") for rule in backup_rules.findall("exclude")} == (
        legacy_domains
    )
    assert all(rule.get("path") == "." for rule in backup_rules.findall("exclude"))

    extraction_rules = ET.parse(
        ROOT_DIR / "mobile/android/app/src/main/res/xml/data_extraction_rules.xml"
    ).getroot()
    modern_domains = legacy_domains | {
        "device_root",
        "device_file",
        "device_database",
        "device_sharedpref",
    }
    for mode in ("cloud-backup", "device-transfer"):
        rules = extraction_rules.find(mode)
        assert rules is not None
        assert {rule.get("domain") for rule in rules.findall("exclude")} == modern_domains
        assert all(rule.get("path") == "." for rule in rules.findall("exclude"))

    privacy_path = ROOT_DIR / "mobile/ios/FARAIMPro/Resources/PrivacyInfo.xcprivacy"
    privacy_root = ET.parse(privacy_path).getroot()
    privacy_xml = ET.tostring(privacy_root, encoding="unicode")
    assert "NSPrivacyAccessedAPICategoryUserDefaults" in privacy_xml
    assert "CA92.1" in privacy_xml
    assert "NSPrivacyCollectedDataTypes" in privacy_xml
    ios_project = (
        ROOT_DIR / "mobile/ios/FARAIMPro.xcodeproj/project.pbxproj"
    ).read_text(encoding="utf-8")
    assert ios_project.count("PrivacyInfo.xcprivacy in Resources") == 2
