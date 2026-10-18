import json
import sys
from pathlib import Path

import pytest

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from finalize_advisory_circular_refresh import finalize  # noqa: E402


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def ac_item(item_id: str, number: str, title: str, status: str = "parsed") -> dict:
    item = {
        "id": item_id,
        "number": number,
        "title": title,
        "documentUrl": f"https://www.faa.gov/document/{item_id}",
        "pdfUrl": f"https://www.faa.gov/documentLibrary/{item_id}.pdf",
        "contentStatus": status,
    }
    if status != "unavailable":
        item["contentPath"] = f"content/{item_id}.json"
    return item


def prepare_claim_files(root: Path) -> None:
    (root / "store/android/metadata/en-US").mkdir(parents=True)
    (root / "store/ios/metadata/en-US").mkdir(parents=True)
    (root / "web/e2e").mkdir(parents=True)
    (root / "scripts").mkdir(exist_ok=True)
    (root / "NEXT_STEPS.md").write_text(
        "- 2 current Advisory Circulars.\n"
        "- Web, Android, and iOS include 1 complete and 0 partial searchable AC text\n"
        "  extractions. FAA lists AC 99-1 as current but its content is unavailable.\n",
        encoding="utf-8",
    )
    for path in (
        root / "store/android/metadata/en-US/full_description.txt",
        root / "store/ios/metadata/en-US/description.txt",
    ):
        path.write_text("- 2 current FAA Advisory Circular records\n", encoding="utf-8")
    (root / "scripts/capture-android-screenshots.sh").write_text(
        'expect "2 current FAA Advisory Circular records"\n'
        'expect "2 current FAA Advisory Circular records"\n',
        encoding="utf-8",
    )
    (root / "web/e2e/updates.spec.ts").write_text(
        "expect('2 current Advisory Circular records')\n",
        encoding="utf-8",
    )


def prepare_refresh(root: Path) -> tuple[Path, Path, Path]:
    before_index = {
        "version": 2,
        "updated": "2026-01-01",
        "items": [
            ac_item("ac-20-1", "20-1", "Old title"),
            ac_item("ac-99-1", "99-1", "Removed", "unavailable"),
        ],
    }
    after_index = {
        "version": 2,
        "updated": "2026-02-02",
        "items": [
            ac_item("ac-20-1", "20-1", "Revised title"),
            ac_item("ac-21-1", "21-1", "Added"),
            ac_item("ac-30-1", "30-1", "Partial", "partial"),
            ac_item("ac-99-2", "99-2", "Unavailable", "unavailable"),
        ],
    }
    coverage = {
        "version": 1,
        "updated": "2026-02-02",
        "total": 4,
        "counts": {"parsed": 2, "partial": 1, "unavailable": 1},
        "items": [
            {"id": "ac-20-1", "status": "parsed"},
            {"id": "ac-21-1", "status": "parsed"},
            {"id": "ac-30-1", "status": "partial"},
            {"id": "ac-99-2", "status": "unavailable"},
        ],
    }
    source_status = {
        "version": 1,
        "generatedAt": "2026-01-01",
        "sources": [
            {
                "id": "ac",
                "lastUpdated": "2026-01-01",
                "itemCount": 2,
                "coverage": "old",
                "notes": ["old"],
            }
        ],
        "changeWatch": [
            {
                "id": "ac-2026-01-01",
                "date": "2026-01-01",
                "sourceId": "ac",
                "title": "Old",
                "summary": "Old",
                "affectedReferences": ["ACs"],
                "actions": ["Review"],
                "link": "/advisory-circulars",
            }
        ],
        "releaseNotes": [
            {
                "date": "2026-01-01",
                "title": "Bundled aviation sources refreshed",
                "details": ["Updated 2 current Advisory Circular records."],
            }
        ],
    }

    before_path = root / "before.json"
    summary_json = root / "summary.json"
    summary_markdown = root / "summary.md"
    write_json(before_path, before_index)
    write_json(root / "data/advisory-circulars/index.json", after_index)
    write_json(root / "data/advisory-circulars/coverage.json", coverage)
    write_json(root / "data/source-status.json", source_status)
    prepare_claim_files(root)
    return before_path, summary_json, summary_markdown


def test_finalize_updates_status_claims_and_change_summary(tmp_path):
    before_path, summary_json, summary_markdown = prepare_refresh(tmp_path)
    original_release_notes = json.loads((tmp_path / "data/source-status.json").read_text())[
        "releaseNotes"
    ]
    e2e_path = tmp_path / "web/e2e/updates.spec.ts"
    original_e2e = e2e_path.read_bytes()

    summary = finalize(tmp_path, before_path, summary_json, summary_markdown)

    assert [item["number"] for item in summary["added"]] == ["21-1", "30-1", "99-2"]
    assert [item["number"] for item in summary["removed"]] == ["99-1"]
    assert summary["changed"][0]["changedFields"] == ["title"]
    assert summary["after"] == {
        "total": 4,
        "pdfs": 4,
        "parsed": 2,
        "partial": 1,
        "unavailable": 1,
    }

    source_status = json.loads((tmp_path / "data/source-status.json").read_text())
    source = source_status["sources"][0]
    assert source_status["generatedAt"] == "2026-02-02"
    assert source["lastUpdated"] == "2026-02-02"
    assert source["itemCount"] == 4
    assert "4 current advisory circulars" in source["coverage"]
    assert source["notes"][-1] == ("FAA lists AC 99-2 as current but its content is unavailable.")
    assert source_status["changeWatch"][0]["id"] == "ac-2026-02-02"
    assert source_status["releaseNotes"] == original_release_notes
    assert e2e_path.read_bytes() == original_e2e

    assert "4 current Advisory Circulars" in (tmp_path / "NEXT_STEPS.md").read_text()
    assert "2 complete and 1 partial" in (tmp_path / "NEXT_STEPS.md").read_text()
    assert (
        "4 current FAA Advisory Circular records"
        in (tmp_path / "store/android/metadata/en-US/full_description.txt").read_text()
    )
    assert "### Added (3)" in summary_markdown.read_text()
    assert "AC 20-1: Revised title (`title`)" in summary_markdown.read_text()
    assert json.loads(summary_json.read_text())["updated"] == "2026-02-02"


def test_finalize_rejects_failed_coverage_before_writing_claims(tmp_path):
    before_path, summary_json, summary_markdown = prepare_refresh(tmp_path)
    coverage_path = tmp_path / "data/advisory-circulars/coverage.json"
    coverage = json.loads(coverage_path.read_text())
    coverage["items"][0]["status"] = "failed"
    coverage["counts"] = {"failed": 1, "parsed": 1, "partial": 1, "unavailable": 1}
    write_json(coverage_path, coverage)
    original_next_steps = (tmp_path / "NEXT_STEPS.md").read_text()

    with pytest.raises(ValueError, match="failed AC refreshes"):
        finalize(tmp_path, before_path, summary_json, summary_markdown)

    assert (tmp_path / "NEXT_STEPS.md").read_text() == original_next_steps
    assert not summary_json.exists()
    assert not summary_markdown.exists()


def test_finalize_rejects_stale_cache_fallback_with_unresolved_refresh_error(tmp_path):
    before_path, summary_json, summary_markdown = prepare_refresh(tmp_path)
    coverage_path = tmp_path / "data/advisory-circulars/coverage.json"
    coverage = json.loads(coverage_path.read_text())
    coverage["items"][0]["refreshError"] = "FAA request timed out"
    write_json(coverage_path, coverage)
    source_path = tmp_path / "data/source-status.json"
    original = source_path.read_bytes()
    with pytest.raises(ValueError, match="Unresolved AC refresh failure"):
        finalize(tmp_path, before_path, summary_json, summary_markdown)
    assert source_path.read_bytes() == original
    assert not summary_json.exists()
    assert not summary_markdown.exists()
