#!/usr/bin/env python3
"""Check bundled aviation source dates against official sources."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import date
from io import StringIO
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

from ecfr import ECFR_VERSIONS_URL, TITLE_49_PARTS, latest_ecfr_issue_date

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"

ECFR_TITLE_14_VERSIONS_URL = ECFR_VERSIONS_URL.format(title=14)
FAA_AIM_URL = "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/"
FAA_PCG_URL = "https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/"
FAA_AC_EXPORT_URL = (
    "https://www.faa.gov/regulations_policies/advisory_circulars/"
    "index.cfm/go/document.exportAll/statusID/2"
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FARAIMPro/1.0; Source Freshness Check)",
    "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
}


@dataclass(frozen=True)
class SourceCheck:
    id: str
    label: str
    local_date: str
    remote_date: str | None
    status: str
    detail: str
    url: str | None = None


def parse_date(value: str) -> date:
    value = value.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return date.fromisoformat(value)

    slash = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})", value)
    if slash:
        month, day, year = slash.groups()
        numeric_year = int(year)
        if numeric_year < 100:
            numeric_year += 2000
        return date(numeric_year, int(month), int(day))

    month_name = re.fullmatch(r"([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})", value)
    if month_name:
        month_text, day, year = month_name.groups()
        month_map = {
            "january": 1,
            "february": 2,
            "march": 3,
            "april": 4,
            "may": 5,
            "june": 6,
            "july": 7,
            "august": 8,
            "september": 9,
            "october": 10,
            "november": 11,
            "december": 12,
        }
        month = month_map.get(month_text.lower())
        if month:
            return date(int(year), month, int(day))

    raise ValueError(f"Unsupported date format: {value}")


def extract_effective_date(html: str) -> str | None:
    text = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
    match = re.search(r"Effective:\s*([0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})", text, re.I)
    if match:
        return parse_date(match.group(1)).isoformat()
    return None


def extract_latest_ac_export_date(csv_text: str) -> tuple[str | None, int]:
    latest_date: str | None = None
    count = 0
    for row in csv.DictReader(StringIO(csv_text)):
        raw_date = row.get("DATE", "").strip()
        if not raw_date:
            continue
        issued = raw_date[:10]
        count += 1
        if latest_date is None or parse_date(issued) > parse_date(latest_date):
            latest_date = issued
    return latest_date, count


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def source_by_id(source_status: dict[str, Any], source_id: str) -> dict[str, Any]:
    for source in source_status["sources"]:
        if source["id"] == source_id:
            return source
    raise KeyError(f"Missing source-status entry: {source_id}")


def compare_source(
    source: dict[str, Any],
    remote_date: str | None,
    detail: str,
    url: str | None = None,
) -> SourceCheck:
    local_date = source["lastUpdated"]
    status = "unknown"
    if remote_date:
        status = "stale" if parse_date(remote_date) > parse_date(local_date) else "current"

    return SourceCheck(
        id=source["id"],
        label=source["label"],
        local_date=local_date,
        remote_date=remote_date,
        status=status,
        detail=detail,
        url=url,
    )


def fetch_json(session: requests.Session, url: str) -> Any:
    response = session.get(url, headers=HEADERS, timeout=45)
    response.raise_for_status()
    return response.json()


def fetch_text(session: requests.Session, url: str) -> str:
    response = session.get(url, headers=HEADERS, timeout=45)
    response.raise_for_status()
    return response.text


def check_far(source_status: dict[str, Any], session: requests.Session) -> SourceCheck:
    source = source_by_id(source_status, "far")
    index = read_json(DATA_DIR / "far" / "index.json")
    snapshots: dict[int, dict[int, str]] = {14: {}, 49: {}}
    for entry in index["parts"]:
        cfr = re.fullmatch(r"(14|49) CFR Part (\d+)", entry["cfr"])
        if cfr is None:
            raise ValueError(f"Unrecognized bundled CFR reference: {entry['cfr']}")
        title, part = map(int, cfr.groups())
        content = read_json(DATA_DIR / entry["file"])
        if content.get("cfr") != entry["cfr"]:
            raise ValueError(f"Bundled CFR identity mismatch for {entry['cfr']}")
        # lastUpdated records when the crawl ran in older bundles. Only each
        # part's effectiveDate identifies the eCFR snapshot actually downloaded.
        snapshots[title][part] = parse_date(content["effectiveDate"]).isoformat()

    if not snapshots[14] or set(snapshots[49]) != set(TITLE_49_PARTS):
        raise ValueError("Bundled FAR index must include Title 14 and all supported Title 49 parts")

    latest_title14 = latest_ecfr_issue_date(fetch_json(session, ECFR_TITLE_14_VERSIONS_URL))
    remote_dates = [latest_title14]
    older_parts = []
    if min(snapshots[14].values()) < latest_title14:
        older_parts.append(f"Title 14 (official issue {latest_title14})")
    for part in TITLE_49_PARTS:
        url = f"{ECFR_VERSIONS_URL.format(title=49)}?part={part}"
        latest = latest_ecfr_issue_date(fetch_json(session, url))
        remote_dates.append(latest)
        if snapshots[49][part] < latest:
            older_parts.append(f"49 CFR Part {part} (official issue {latest})")

    local_dates = [value for parts in snapshots.values() for value in parts.values()]
    detail = (
        "Compared bundled effectiveDate values with complete eCFR issue metadata for "
        f"Title 14 and Title 49 parts {', '.join(map(str, TITLE_49_PARTS))}. "
        f"Bundled snapshots span {min(local_dates)} to {max(local_dates)}."
    )
    if older_parts:
        detail += f" Newer official content: {'; '.join(older_parts)}."
    return SourceCheck(
        id=source["id"],
        label=source["label"],
        local_date=min(local_dates),
        remote_date=max(remote_dates),
        status="stale" if older_parts else "current",
        detail=detail,
        url=ECFR_TITLE_14_VERSIONS_URL,
    )


def check_faa_effective_source(
    source_status: dict[str, Any],
    source_id: str,
    url: str,
    detail: str,
    session: requests.Session,
) -> SourceCheck:
    source = source_by_id(source_status, source_id)
    try:
        html = fetch_text(session, url)
    except requests.RequestException as exc:
        status_code = exc.response.status_code if exc.response is not None else "network"
        return SourceCheck(
            id=source["id"],
            label=source["label"],
            local_date=source["lastUpdated"],
            remote_date=None,
            status="unknown",
            detail=f"Official FAA source unavailable during check ({status_code}).",
            url=url,
        )
    return compare_source(source, extract_effective_date(html), detail, url)


def check_advisory_circulars(
    source_status: dict[str, Any],
    session: requests.Session | None = None,
) -> SourceCheck:
    source = source_by_id(source_status, "ac")
    if session:
        try:
            latest_issued, count = extract_latest_ac_export_date(
                fetch_text(session, FAA_AC_EXPORT_URL)
            )
        except requests.RequestException as exc:
            status_code = exc.response.status_code if exc.response is not None else "network"
            return SourceCheck(
                id=source["id"],
                label=source["label"],
                local_date=source["lastUpdated"],
                remote_date=None,
                status="unknown",
                detail=f"FAA current AC export unavailable during check ({status_code}).",
                url=FAA_AC_EXPORT_URL,
            )
        date_check = compare_source(
            source,
            latest_issued,
            f"Latest issued date in FAA current AC export ({count} active records).",
            FAA_AC_EXPORT_URL,
        )
        expected_count = source.get("itemCount")
        if isinstance(expected_count, int) and count != expected_count:
            return SourceCheck(
                id=date_check.id,
                label=date_check.label,
                local_date=date_check.local_date,
                remote_date=date_check.remote_date,
                status="stale",
                detail=(
                    f"FAA current AC export has {count} active records; "
                    f"bundled catalog declares {expected_count}."
                ),
                url=date_check.url,
            )
        return date_check

    index = read_json(DATA_DIR / "advisory-circulars" / "index.json")
    issued_dates = [item["issued"] for item in index.get("items", []) if item.get("issued")]
    latest_issued = max(issued_dates) if issued_dates else None
    return compare_source(
        source,
        latest_issued,
        "Latest issued date inside bundled FAA AC snapshot.",
        source.get("officialUrl"),
    )


def check_local_consistency(source_status: dict[str, Any]) -> list[SourceCheck]:
    local_indexes = [
        ("far", DATA_DIR / "far" / "index.json", "lastUpdated"),
        ("aim", DATA_DIR / "aim" / "index.json", "lastUpdated"),
        ("pcg", DATA_DIR / "aim" / "pcg.json", "lastUpdated"),
        ("ac", DATA_DIR / "advisory-circulars" / "index.json", "updated"),
    ]
    checks: list[SourceCheck] = []
    for source_id, path, field in local_indexes:
        source = source_by_id(source_status, source_id)
        value = read_json(path).get(field)
        status = "current" if value == source["lastUpdated"] else "stale"
        checks.append(
            SourceCheck(
                id=f"{source_id}-local",
                label=f"{source['label']} local metadata",
                local_date=source["lastUpdated"],
                remote_date=value,
                status=status,
                detail=f"{path.relative_to(ROOT_DIR)} {field} matches source-status.json.",
            )
        )
    return checks


def run_checks(offline: bool = False) -> list[SourceCheck]:
    source_status = read_json(DATA_DIR / "source-status.json")
    checks = check_local_consistency(source_status)

    if not offline:
        session = requests.Session()
        checks.extend(
            [
                check_far(source_status, session),
                check_advisory_circulars(source_status, session),
                check_faa_effective_source(
                    source_status,
                    "aim",
                    FAA_AIM_URL,
                    "FAA AIM publication effective date.",
                    session,
                ),
                check_faa_effective_source(
                    source_status,
                    "pcg",
                    FAA_PCG_URL,
                    "FAA PCG publication effective date.",
                    session,
                ),
            ]
        )
    else:
        checks.append(check_advisory_circulars(source_status))

    return checks


def format_text(checks: list[SourceCheck]) -> str:
    lines = ["Source freshness"]
    for check in checks:
        remote = check.remote_date or "unknown"
        lines.append(
            f"- {check.id}: {check.status} "
            f"(local {check.local_date}, official/index {remote}) - {check.detail}"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Only compare bundled local metadata, with no network calls.",
    )
    args = parser.parse_args(argv)

    checks = run_checks(offline=args.offline)
    if args.json:
        print(json.dumps([asdict(check) for check in checks], indent=2))
    else:
        print(format_text(checks))

    return 1 if any(check.status != "current" for check in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
