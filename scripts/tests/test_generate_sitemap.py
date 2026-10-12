import json
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[2]
GENERATOR_PATH = ROOT_DIR / "scripts" / "generate_sitemap.js"
NODE_SCRIPT = """
const { generateSitemap } = require(process.argv[1]);
generateSitemap(process.argv[2], process.argv[3]);
"""
SITEMAP_NAMESPACE = {"sitemap": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def run_generator(data_dir: Path, public_dir: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "node",
            "-e",
            NODE_SCRIPT,
            str(GENERATOR_PATH),
            str(data_dir),
            str(public_dir),
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def sitemap_entries(path: Path) -> dict[str, str | None]:
    root = ET.parse(path).getroot()
    entries = {}
    for url in root.findall("sitemap:url", SITEMAP_NAMESPACE):
        location = url.findtext("sitemap:loc", namespaces=SITEMAP_NAMESPACE)
        last_modified = url.findtext("sitemap:lastmod", namespaces=SITEMAP_NAMESPACE)
        assert location
        entries[location] = last_modified
    return entries


@pytest.fixture
def sitemap_data(tmp_path: Path) -> tuple[Path, Path]:
    data_dir = tmp_path / "data"
    public_dir = tmp_path / "public"
    write_json(
        data_dir / "source-status.json",
        {
            "generatedAt": "2026-08-29",
            "sources": [
                {"id": "far", "lastUpdated": "2026-08-13"},
                {"id": "aim", "lastUpdated": "2026-07-09"},
                {"id": "pcg", "lastUpdated": "2026-07-08"},
                {"id": "ac", "lastUpdated": "2026-08-29"},
                {"id": "study", "lastUpdated": "2026-06-07"},
            ],
        },
    )
    write_json(data_dir / "far" / "part1.json", {"part": "1"})
    write_json(data_dir / "aim" / "chapter1.json", {"chapter": "1"})
    write_json(
        data_dir / "quizzes" / "aim-chapter10-helicopter.json",
        {"id": "aim-chapter10-helicopter"},
    )
    write_json(
        data_dir / "flashcards" / "far-definitions.json",
        {"id": "far-definitions"},
    )
    write_json(
        data_dir / "advisory-circulars" / "index.json",
        {
            "items": [
                {
                    "id": "ac-current-date",
                    "contentPath": "content/ac-current-date.json",
                    "contentUpdated": "2026-08-28",
                },
                {
                    "id": "ac-source-date",
                    "contentPath": "content/ac-source-date.json",
                },
            ]
        },
    )
    return data_dir, public_dir


def test_sitemap_uses_source_specific_dates(sitemap_data: tuple[Path, Path]) -> None:
    data_dir, public_dir = sitemap_data

    run_generator(data_dir, public_dir)

    entries = sitemap_entries(public_dir / "sitemap.xml")
    assert entries["https://faraim.online/far"] == "2026-08-13"
    assert entries["https://faraim.online/far/1"] == "2026-08-13"
    assert entries["https://faraim.online/aim"] == "2026-07-09"
    assert entries["https://faraim.online/aim/1"] == "2026-07-09"
    assert entries["https://faraim.online/glossary"] == "2026-07-08"
    assert entries["https://faraim.online/advisory-circulars"] == "2026-08-29"
    assert (
        entries["https://faraim.online/advisory-circulars/ac-current-date"]
        == "2026-08-28"
    )
    assert (
        entries["https://faraim.online/advisory-circulars/ac-source-date"]
        == "2026-08-29"
    )
    assert entries["https://faraim.online/study"] == "2026-06-07"


def test_sitemap_omits_dates_for_unrelated_static_routes(
    sitemap_data: tuple[Path, Path],
) -> None:
    data_dir, public_dir = sitemap_data

    run_generator(data_dir, public_dir)

    entries = sitemap_entries(public_dir / "sitemap.xml")
    for route in (
        "/",
        "/quizzes",
        "/flashcards",
        "/search",
        "/privacy",
        "/terms",
        "/support",
    ):
        assert entries[f"https://faraim.online{route}"] is None


def test_sitemap_includes_quiz_and_flashcard_detail_routes(
    sitemap_data: tuple[Path, Path],
) -> None:
    data_dir, public_dir = sitemap_data

    run_generator(data_dir, public_dir)

    entries = sitemap_entries(public_dir / "sitemap.xml")
    assert entries["https://faraim.online/quizzes/aim-chapter10-helicopter"] == "2026-06-07"
    assert entries["https://faraim.online/flashcards/far-definitions"] == "2026-06-07"
