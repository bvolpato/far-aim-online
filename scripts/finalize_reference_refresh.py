#!/usr/bin/env python3
"""Reconcile FAR, AIM, and glossary coverage after an official-source refresh."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def far_sections(part: dict) -> list[dict]:
    return part.get("sections", []) + [
        section for subpart in part.get("subparts", []) for section in subpart.get("sections", [])
    ]


def update_source_status(root_dir: Path) -> dict:
    data_dir = root_dir / "data"
    status = read_json(data_dir / "source-status.json")
    original_sources = json.dumps(status["sources"], sort_keys=True)
    sources = {source["id"]: source for source in status["sources"]}

    far_index = read_json(data_dir / "far/index.json")
    far_parts = [read_json(data_dir / item["file"]) for item in far_index["parts"]]
    if len(far_parts) < 180 or len({part["part"] for part in far_parts}) != len(far_parts):
        raise ValueError("Incomplete or duplicate FAR parts")
    sections = sum(len(far_sections(part)) for part in far_parts)
    appendices = sum(len(part.get("appendices", [])) for part in far_parts)
    figures = sum(
        len(reference.get("figures", []))
        for part in far_parts
        for reference in far_sections(part) + part.get("appendices", [])
    )
    if sections < 5000 or far_index["totalFigures"] != figures:
        raise ValueError("Incomplete FAR sections or inconsistent figure count")
    for item, part in zip(far_index["parts"], far_parts, strict=True):
        if item["sectionCount"] != len(far_sections(part)):
            raise ValueError(f"FAR section count differs for Part {part['part']}")
    content_parts = sum(bool(far_sections(part) or part.get("appendices")) for part in far_parts)
    sources["far"].update(
        lastUpdated=far_index["lastUpdated"],
        itemCount=len(far_parts),
        sectionCount=sections,
        coverage=(
            f"{len(far_parts):,} indexed parts, {content_parts:,} content parts, "
            f"{sections:,} sections, {appendices:,} appendices and {figures:,} figures"
        ),
    )

    aim_index = read_json(data_dir / "aim/index.json")
    aim_chapters = [read_json(data_dir / item["file"]) for item in aim_index["chapters"]]
    if sorted(chapter["chapter"] for chapter in aim_chapters) != list(range(12)):
        raise ValueError("AIM refresh must contain General Information and Chapters 1 through 11")
    aim_sections = sum(len(chapter["sections"]) for chapter in aim_chapters)
    aim_figures = sum(
        len(section.get("figures", [])) for chapter in aim_chapters for section in chapter["sections"]
    )
    if (
        aim_sections < 300
        or aim_sections != aim_index["totalSections"]
        or aim_figures != aim_index["totalImages"]
    ):
        raise ValueError("Incomplete AIM sections or inconsistent coverage counts")
    for item, chapter in zip(aim_index["chapters"], aim_chapters, strict=True):
        if item["sectionCount"] != len(chapter["sections"]):
            raise ValueError(f"AIM section count differs for Chapter {chapter['chapter']}")
    sources["aim"].update(
        lastUpdated=aim_index["lastUpdated"],
        itemCount=len(aim_chapters),
        sectionCount=aim_sections,
        coverage=(
            f"11 core chapters, change notes, 5 appendices, "
            f"{aim_sections:,} sections and {aim_figures:,} figures"
        ),
    )

    pcg = read_json(data_dir / "aim/pcg.json")
    terms = pcg["terms"]
    if len(terms) < 1000 or len({term["term"] for term in terms}) != len(terms):
        raise ValueError("Incomplete or duplicate PCG terms")
    if any(not term["term"].strip() or not term["definition"].strip() for term in terms):
        raise ValueError("PCG contains an empty term or definition")
    sources["pcg"].update(
        lastUpdated=pcg["lastUpdated"], itemCount=len(terms), coverage=f"{len(terms):,} terms"
    )

    if json.dumps(status["sources"], sort_keys=True) != original_sources:
        status["generatedAt"] = date.today().isoformat()
    for watch in status.get("changeWatch", []):
        source_id = watch.get("sourceId")
        if source_id not in {"far", "aim"}:
            continue
        updated = sources[source_id]["lastUpdated"]
        watch["date"] = updated
        watch["id"] = f"{'aim-pcg' if source_id == 'aim' else 'far'}-{updated}"
        watch["affectedReferences"] = [
            "49 CFR Part 830" if reference == "14 CFR Part 830" else reference
            for reference in watch.get("affectedReferences", [])
        ]
    return status


def main() -> None:
    status = update_source_status(ROOT_DIR)
    (ROOT_DIR / "data/source-status.json").write_text(
        json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    for source in status["sources"]:
        if source["id"] in {"far", "aim", "pcg"}:
            print(f"{source['shortLabel']}: {source['lastUpdated']}, {source['coverage']}")


if __name__ == "__main__":
    main()
