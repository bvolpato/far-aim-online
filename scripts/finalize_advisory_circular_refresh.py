#!/usr/bin/env python3
"""Finalize a refreshed FAA Advisory Circular snapshot and summarize its changes."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def json_text(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def item_map(index: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in index.get("items", [])}


def catalog_changes(
    before_index: dict[str, Any],
    after_index: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    before = item_map(before_index)
    after = item_map(after_index)

    added = [after[item_id] for item_id in after.keys() - before.keys()]
    removed = [before[item_id] for item_id in before.keys() - after.keys()]
    changed: list[dict[str, Any]] = []
    for item_id in before.keys() & after.keys():
        if before[item_id] == after[item_id]:
            continue
        fields = sorted(
            key
            for key in before[item_id].keys() | after[item_id].keys()
            if before[item_id].get(key) != after[item_id].get(key)
        )
        changed.append({**after[item_id], "changedFields": fields})

    def sort_key(item: dict[str, Any]) -> tuple[str, str]:
        return item.get("number", ""), item["id"]

    return {
        "added": sorted(added, key=sort_key),
        "removed": sorted(removed, key=sort_key),
        "changed": sorted(changed, key=sort_key),
    }


def snapshot_stats(index: dict[str, Any]) -> dict[str, int]:
    items = index.get("items", [])
    counts = Counter(item.get("contentStatus", "unknown") for item in items)
    return {
        "total": len(items),
        "pdfs": sum(bool(item.get("pdfUrl")) for item in items),
        "parsed": counts["parsed"],
        "partial": counts["partial"],
        "unavailable": counts["unavailable"],
    }


def validate_coverage(
    index: dict[str, Any],
    coverage: dict[str, Any],
) -> dict[str, int]:
    items = item_map(index)
    results = {item["id"]: item for item in coverage.get("items", [])}
    if items.keys() != results.keys():
        missing = sorted(items.keys() - results.keys())
        extra = sorted(results.keys() - items.keys())
        raise ValueError(f"Coverage IDs differ from index: missing={missing}, extra={extra}")

    counts = Counter(result.get("status", "unknown") for result in results.values())
    declared_counts = coverage.get("counts", {})
    if dict(sorted(counts.items())) != declared_counts:
        raise ValueError(
            f"Coverage counts differ from items: declared={declared_counts}, actual={dict(counts)}"
        )
    if coverage.get("total") != len(items):
        raise ValueError(
            f"Coverage total {coverage.get('total')} differs from index total {len(items)}"
        )
    if counts.get("failed", 0):
        raise ValueError(f"Coverage contains {counts['failed']} failed AC refreshes")

    for item_id, item in items.items():
        if item.get("contentStatus") != results[item_id].get("status"):
            raise ValueError(f"Coverage status differs from index for {item_id}")
        if results[item_id].get("refreshError"):
            raise ValueError(f"Unresolved AC refresh failure for {item_id}")

    return {
        "total": len(items),
        "pdfs": sum(bool(item.get("pdfUrl")) for item in items.values()),
        "parsed": counts["parsed"],
        "partial": counts["partial"],
        "unavailable": counts["unavailable"],
    }


def unavailable_note(
    index: dict[str, Any],
    coverage: dict[str, Any],
) -> str:
    numbers = sorted(
        item_map(index)[result["id"]]["number"]
        for result in coverage["items"]
        if result["status"] == "unavailable"
        and not item_map(index)[result["id"]].get("contentError")
    )
    restricted = sum(
        result["status"] == "unavailable"
        and bool(item_map(index)[result["id"]].get("contentError"))
        for result in coverage["items"]
    )
    rights_note = (
        f" Offline text for {restricted} additional ACs is omitted pending third-party "
        "republication review; their official FAA links remain available."
        if restricted
        else ""
    )
    if not numbers:
        return rights_note.strip() or "Every current AC has published content."
    if len(numbers) == 1:
        return f"FAA lists AC {numbers[0]} as current but its content is unavailable." + rights_note
    return (
        f"FAA lists {len(numbers)} current ACs without published content: {', '.join(numbers)}."
        + rights_note
    )


def update_source_status(
    source_status: dict[str, Any],
    index: dict[str, Any],
    coverage: dict[str, Any],
    stats: dict[str, int],
) -> dict[str, Any]:
    updated = index.get("updated")
    if not isinstance(updated, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", updated):
        raise ValueError("Advisory Circular index updated date must use YYYY-MM-DD")
    if coverage.get("updated") != updated:
        raise ValueError("Advisory Circular index and coverage dates differ")

    source = next((item for item in source_status["sources"] if item["id"] == "ac"), None)
    if source is None:
        raise ValueError("Missing AC source-status entry")

    total = stats["total"]
    pdfs = stats["pdfs"]
    parsed = stats["parsed"]
    partial = stats["partial"]
    note = unavailable_note(index, coverage)
    source_status["generatedAt"] = updated
    source.update(
        {
            "lastUpdated": updated,
            "itemCount": total,
            "coverage": (
                f"{total:,} current advisory circulars, {pdfs:,} official PDFs, "
                f"{parsed:,} text extractions covering every page and {partial:,} partial extractions"
            ),
            "notes": [
                "Metadata is generated from the FAA current Advisory Circular export and document list.",
                (
                    f"Searchable text is bundled for {parsed + partial:,} records; {parsed:,} have text on every "
                    f"PDF page and {partial:,} are marked partial. Page coverage does not preserve all figures or layout."
                ),
                (
                    "Partial records direct readers to the official PDF for omitted pages, "
                    "figures and exact layout."
                ),
                note,
            ],
        }
    )

    watch = next(
        (item for item in source_status.get("changeWatch", []) if item.get("sourceId") == "ac"),
        None,
    )
    if watch is None:
        raise ValueError("Missing AC change-watch entry")
    watch.update(
        {
            "id": f"ac-{updated}",
            "date": updated,
            "title": "Advisory Circular archive refreshed",
            "summary": (
                f"The Advisory Circular library includes {total:,} current FAA records, "
                f"{pdfs:,} direct PDF links, {parsed:,} text extractions covering every page, and "
                f"{partial:,} clearly marked partial extractions."
            ),
        }
    )
    return source_status


def replace_exact(text: str, pattern: str, replacement: str, expected: int, path: Path) -> str:
    updated, count = re.subn(pattern, replacement, text, flags=re.MULTILINE)
    if count != expected:
        raise ValueError(f"Expected {expected} claim matches in {path}, found {count}")
    return updated


def claim_updates(
    root_dir: Path,
    stats: dict[str, int],
    unavailable: str,
) -> dict[Path, str]:
    total = stats["total"]
    parsed = stats["parsed"]
    partial = stats["partial"]
    updates: dict[Path, str] = {}

    next_steps = root_dir / "NEXT_STEPS.md"
    text = next_steps.read_text(encoding="utf-8")
    text = replace_exact(
        text,
        r"[\d,]+ current Advisory Circulars",
        f"{total:,} current Advisory Circulars",
        1,
        next_steps,
    )
    text = replace_exact(
        text,
        (
            r"Web, Android, and iOS include [\d,]+ complete and [\d,]+ partial searchable "
            r"AC text\n  extractions\. [^\n]+"
        ),
        (
            f"Web, Android, and iOS include {parsed:,} complete and {partial:,} partial "
            f"searchable AC text\n  extractions. {unavailable}"
        ),
        1,
        next_steps,
    )
    updates[next_steps] = text

    for relative_path in (
        "store/android/metadata/en-US/full_description.txt",
        "store/ios/metadata/en-US/description.txt",
    ):
        path = root_dir / relative_path
        updates[path] = replace_exact(
            path.read_text(encoding="utf-8"),
            r"[\d,]+ current FAA Advisory Circular records",
            f"{total:,} current FAA Advisory Circular records",
            1,
            path,
        )

    screenshot_script = root_dir / "scripts/capture-android-screenshots.sh"
    updates[screenshot_script] = replace_exact(
        screenshot_script.read_text(encoding="utf-8"),
        r"[\d,]+ current FAA Advisory Circular records",
        f"{total:,} current FAA Advisory Circular records",
        2,
        screenshot_script,
    )

    return updates


def render_markdown(summary: dict[str, Any]) -> str:
    before = summary["before"]
    after = summary["after"]
    lines = [
        "## FAA Advisory Circular refresh",
        "",
        "| Metric | Before | After |",
        "| --- | ---: | ---: |",
    ]
    for key, label in (
        ("total", "Current records"),
        ("pdfs", "Official PDFs"),
        ("parsed", "Complete extractions"),
        ("partial", "Partial extractions"),
        ("unavailable", "Unavailable content"),
    ):
        lines.append(f"| {label} | {before[key]:,} | {after[key]:,} |")

    for key, label in (("added", "Added"), ("removed", "Removed"), ("changed", "Changed")):
        items = summary[key]
        lines.extend(["", f"### {label} ({len(items)})", ""])
        if not items:
            lines.append("None.")
            continue
        for item in items:
            suffix = ""
            if key == "changed":
                suffix = f" (`{', '.join(item['changedFields'])}`)"
            lines.append(f"- AC {item['number']}: {item['title']}{suffix}")
    lines.append("")
    return "\n".join(lines)


def finalize(
    root_dir: Path,
    before_index_path: Path,
    summary_json_path: Path,
    summary_markdown_path: Path,
) -> dict[str, Any]:
    before_index = load_json(before_index_path)
    index_path = root_dir / "data/advisory-circulars/index.json"
    coverage_path = root_dir / "data/advisory-circulars/coverage.json"
    source_status_path = root_dir / "data/source-status.json"
    after_index = load_json(index_path)
    coverage = load_json(coverage_path)
    stats = validate_coverage(after_index, coverage)
    changes = catalog_changes(before_index, after_index)
    if not any(changes.values()):
        raise ValueError("AC finalization requested without catalog or content changes")

    source_status = update_source_status(
        load_json(source_status_path),
        after_index,
        coverage,
        stats,
    )
    note = unavailable_note(after_index, coverage)
    writes = claim_updates(root_dir, stats, note)
    writes[source_status_path] = json_text(source_status)

    summary = {
        "updated": after_index["updated"],
        "before": snapshot_stats(before_index),
        "after": stats,
        **changes,
    }
    summary_json = json_text(summary)
    summary_markdown = render_markdown(summary)

    for path, text in writes.items():
        path.write_text(text, encoding="utf-8")
    summary_json_path.write_text(summary_json, encoding="utf-8")
    summary_markdown_path.write_text(summary_markdown, encoding="utf-8")
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before-index", type=Path, required=True)
    parser.add_argument("--summary-json", type=Path, required=True)
    parser.add_argument("--summary-markdown", type=Path, required=True)
    args = parser.parse_args(argv)

    try:
        summary = finalize(
            ROOT_DIR,
            args.before_index,
            args.summary_json,
            args.summary_markdown,
        )
    except (KeyError, OSError, ValueError) as error:
        print(f"AC refresh finalization failed: {error}", file=sys.stderr)
        return 1

    print(
        "Finalized FAA AC refresh: "
        f"added={len(summary['added'])}, removed={len(summary['removed'])}, "
        f"changed={len(summary['changed'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
