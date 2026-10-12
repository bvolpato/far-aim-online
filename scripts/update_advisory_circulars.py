#!/usr/bin/env python3
"""Update bundled FAA Advisory Circular metadata from official FAA sources."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from io import StringIO
from pathlib import Path
from typing import Any
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import requests
import urllib3.util.connection as urllib3_connection
from bs4 import BeautifulSoup


def ipv4_only() -> socket.AddressFamily:
    return socket.AF_INET


# FAA document-library requests intermittently return 403 through its IPv6 edge.
urllib3_connection.allowed_gai_family = ipv4_only

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT_DIR / "data" / "advisory-circulars" / "index.json"

FAA_BASE_URL = "https://www.faa.gov"
FAA_AC_EXPORT_URL = (
    "https://www.faa.gov/regulations_policies/advisory_circulars/"
    "index.cfm/go/document.exportAll/statusID/2"
)
FAA_AC_LIST_URL = (
    "https://www.faa.gov/regulations_policies/advisory_circulars/"
    "index.cfm/go/document.list/?statusID=2"
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FARAIMPro/1.0; AC Metadata Refresh)",
    "Accept": "text/csv,text/html;q=0.9,*/*;q=0.8",
}

CATEGORY_BY_MAJOR = {
    "00": "General Guidance",
    "20": "Aircraft Certification and Airworthiness",
    "21": "Certification Procedures",
    "23": "Normal Category Airplanes",
    "25": "Transport Category Airplanes",
    "27": "Rotorcraft Airworthiness",
    "29": "Transport Rotorcraft Airworthiness",
    "33": "Engines",
    "35": "Propellers",
    "36": "Noise Standards",
    "39": "Airworthiness Directives",
    "43": "Maintenance",
    "45": "Identification and Marking",
    "60": "Flight Simulation Training Devices",
    "61": "Pilot Certification",
    "63": "Flight Crewmembers",
    "65": "Airmen and Dispatchers",
    "70": "Airspace and Obstruction",
    "90": "Air Traffic and General Operations",
    "91": "General Operating and Flight Rules",
    "103": "Ultralight Vehicles",
    "105": "Parachute Operations",
    "107": "Unmanned Aircraft Systems",
    "120": "Air Carrier Operations",
    "121": "Air Carrier Operations",
    "125": "Large Aircraft Operations",
    "129": "Foreign Air Carrier Operations",
    "133": "Rotorcraft External Load",
    "135": "Commuter and On Demand Operations",
    "136": "Commercial Air Tours",
    "137": "Agricultural Aircraft Operations",
    "139": "Airport Certification",
    "141": "Pilot Schools",
    "142": "Training Centers",
    "145": "Repair Stations",
    "147": "Aviation Maintenance Technician Schools",
    "150": "Airport Guidance",
    "170": "Navigation Facilities",
    "171": "Non-Federal Navigation Facilities",
    "183": "Representatives of the Administrator",
    "187": "Certification and Inspection Fees",
    "450": "Commercial Space Transportation",
}

CATEGORY_BY_NUMBER = {
    "120-117": "Drug and Alcohol Testing",
    "120-126A": "Drug and Alcohol Testing",
}

STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "be",
    "by",
    "for",
    "in",
    "is",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "use",
    "using",
    "we",
    "with",
    "will",
    "you",
    "your",
    "from",
    "into",
    "under",
    "including",
    "advisory",
    "circular",
    "faa",
    "aircraft",
}

CURATED_NUMBERS = {"20-62E", "20-109B", "21-12D", "39-7D", "43-9D", "43.9-1G", "65-30B"}
RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}


def fetch_text(
    session: requests.Session,
    url: str,
    attempts: int = 4,
    timeout: int = 120,
) -> str:
    for attempt in range(attempts):
        response = None
        try:
            response = session.get(url, headers=HEADERS, timeout=(15, timeout))
            response.raise_for_status()
            response.encoding = response.encoding or "utf-8"
            return response.text
        except requests.RequestException as error:
            if isinstance(error, requests.exceptions.SSLError):
                raise
            retryable = isinstance(
                error,
                (
                    requests.Timeout,
                    requests.ConnectionError,
                    requests.exceptions.ChunkedEncodingError,
                ),
            ) or (
                isinstance(error, requests.HTTPError)
                and response is not None
                and response.status_code in RETRYABLE_STATUS_CODES
            )
            if not retryable or attempt + 1 == attempts:
                raise
            delay = min(30, 2 ** (attempt + 1))
            if response is not None:
                try:
                    delay = max(delay, min(30, int(response.headers.get("Retry-After", ""))))
                except ValueError:
                    pass
            print(
                f"FAA catalog request {attempt + 1}/{attempts} failed for {url}: "
                f"{type(error).__name__}: {error}; retrying in {delay}s",
                file=sys.stderr,
                flush=True,
            )
        finally:
            if response is not None:
                response.close()
        time.sleep(delay)
    raise ValueError("Catalog request attempts must be positive")


def read_or_fetch_text(
    session: requests.Session,
    path: str | None,
    url: str,
    attempts: int = 4,
    timeout: int = 120,
) -> str:
    if path:
        return Path(path).read_text(encoding="utf-8")
    return fetch_text(session, url, attempts=attempts, timeout=timeout)


def clean_text(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip()
    # AC 20-184A's FAA catalog summary splits this citation; its PDF confirms § 23.2525.
    cleaned = re.sub(r"(§{1,2}\s+)2\s+3\.2525\b", r"\g<1>23.2525", cleaned)
    cleaned = re.sub(r",(?=\S)", ", ", cleaned)
    cleaned = re.sub(r"(?<=[a-z0-9)])\.(?=[A-Z])", ". ", cleaned)
    cleaned = cleaned.replace("Administrationas", "Administration as")
    return cleaned


def parse_issued_date(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    if "T" in value:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
    return value[:10]


def slugify_ac_number(number: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", number.lower()).strip("-")
    return f"ac-{slug}"


def subject_major(number: str) -> str:
    match = re.match(r"(\d+)", number)
    return match.group(1) if match else ""


def natural_sort_key(number: str) -> list[int | str]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", number)]


def category_for(number: str) -> str:
    major = subject_major(number)
    return CATEGORY_BY_NUMBER.get(
        number,
        CATEGORY_BY_MAJOR.get(major, "FAA Advisory Circular"),
    )


def tags_for(number: str, title: str, office: str, category: str) -> list[str]:
    tags: list[str] = []
    candidates = [subject_major(number), office.lower(), category.lower()]
    candidates.extend(token.lower() for token in re.findall(r"[A-Za-z0-9]+", title))

    for candidate in candidates:
        candidate = candidate.strip()
        if len(candidate) < 2 or candidate in STOP_WORDS:
            continue
        if candidate not in tags:
            tags.append(candidate)
        if len(tags) >= 10:
            break
    return tags


def parse_csv_export(csv_text: str) -> dict[str, dict[str, str]]:
    rows: dict[str, dict[str, str]] = {}
    reader = csv.DictReader(StringIO(csv_text))
    for row in reader:
        number = clean_text(row.get("DOCUMENTNUMBER", ""))
        if not number:
            continue
        rows[number] = {
            "number": number,
            "title": clean_text(row.get("TITLE", "")),
            "status": "Active",
            "issued": parse_issued_date(row.get("DATE", "")),
            "office": clean_text(row.get("OFFICE", "")),
            "changeNumber": clean_text(row.get("CHANGENUMBER", "")),
        }
    return rows


def parse_list_page(html: str) -> dict[str, dict[str, str]]:
    soup = BeautifulSoup(html, "lxml")
    items: dict[str, dict[str, str]] = {}

    for row in soup.select("table.searchResults tbody tr"):
        cells = row.find_all("td")
        if len(cells) < 5:
            continue

        link = cells[1].find("a", href=re.compile(r"document\.information"))
        if link is None:
            continue

        number = clean_text(cells[0].get_text(" ", strip=True))
        title = clean_text(link.get_text(" ", strip=True))
        summary_node = cells[1].select_one(".lineClamp")
        summary = clean_text(summary_node.get_text(" ", strip=True)) if summary_node else ""
        document_url = urljoin(FAA_BASE_URL, link["href"])

        items[number] = {
            "number": number,
            "title": title,
            "status": clean_text(cells[2].get_text(" ", strip=True)),
            "office": clean_text(cells[3].get_text(" ", strip=True)),
            "issued": parse_issued_date(clean_text(cells[4].get_text(" ", strip=True))),
            "summary": summary,
            "documentUrl": document_url,
        }

    return items


def load_existing_index() -> dict[str, Any]:
    if not DATA_PATH.exists():
        return {}
    with DATA_PATH.open(encoding="utf-8") as file:
        return json.load(file)


def load_existing_items(index: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    data = load_existing_index() if index is None else index
    return {item["number"]: dict(item) for item in data.get("items", [])}


def extract_pdf_url(html: str) -> str | None:
    soup = BeautifulSoup(html, "lxml")
    candidates: list[str] = []
    for link in soup.find_all("a", href=True):
        href = link["href"]
        if ".pdf" in href.lower():
            candidates.append(urljoin(FAA_BASE_URL, href))

    preferred = [url for url in candidates if "/documentLibrary/media/Advisory_Circular/" in url]
    return (preferred or candidates or [None])[0]


def fetch_pdf_url(document_url: str, attempts: int = 4) -> tuple[bool, str | None]:
    for attempt in range(attempts):
        try:
            response = requests.get(document_url, headers=HEADERS, timeout=45)
            response.raise_for_status()
            return True, extract_pdf_url(response.text)
        except requests.RequestException:
            if attempt + 1 < attempts:
                time.sleep(2**attempt)
    return False, None


def fetch_pdf_urls(
    items: dict[str, dict[str, str]],
    max_workers: int,
) -> dict[str, str | None]:
    urls: dict[str, str | None] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_by_number = {
            executor.submit(fetch_pdf_url, item["documentUrl"]): number
            for number, item in items.items()
            if item.get("documentUrl")
        }
        for index, future in enumerate(as_completed(future_by_number), start=1):
            number = future_by_number[future]
            fetched, pdf_url = future.result()
            if fetched:
                urls[number] = pdf_url
            if index % 100 == 0:
                print(f"Fetched PDF metadata for {index}/{len(future_by_number)} ACs")
    return urls


def fetch_pdf_sha256(
    pdf_url: str,
    timeout: int,
    max_pdf_mib: int,
    attempts: int = 2,
) -> tuple[bool, str | None]:
    byte_limit = max_pdf_mib * 1024 * 1024
    for attempt in range(attempts):
        try:
            with requests.get(
                pdf_url,
                headers=HEADERS,
                timeout=timeout,
                stream=True,
            ) as response:
                response.raise_for_status()
                digest = hashlib.sha256()
                total = 0
                prefix = b""
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    if not chunk:
                        continue
                    if len(prefix) < 4:
                        prefix = (prefix + chunk)[:4]
                    total += len(chunk)
                    if total > byte_limit:
                        return False, None
                    digest.update(chunk)
                if prefix != b"%PDF":
                    return False, None
                return True, digest.hexdigest()
        except requests.RequestException:
            if attempt + 1 < attempts:
                time.sleep(2**attempt)
    return False, None


def select_pdf_audit_candidates(
    candidates: dict[str, tuple[str, str]],
    limit: int,
    date: str,
) -> tuple[dict[str, tuple[str, str]], int, int]:
    ordered_ids = sorted(candidates)
    if not ordered_ids:
        return {}, 0, 0
    shard_count = (len(ordered_ids) + limit - 1) // limit
    year, month = (int(part) for part in date.split("-", maxsplit=2)[:2])
    shard_index = (year * 12 + month - 1) % shard_count
    start = shard_index * limit
    selected_ids = ordered_ids[start : start + limit]
    return {item_id: candidates[item_id] for item_id in selected_ids}, shard_index, shard_count


def audit_pdf_content(
    items: list[dict[str, Any]],
    existing_items: dict[str, dict[str, Any]],
    max_workers: int,
    timeout: int,
    max_pdf_mib: int,
    limit: int,
) -> set[str]:
    candidates: dict[str, tuple[str, str]] = {}
    for item in items:
        existing = existing_items.get(item["number"], {})
        pdf_url = item.get("pdfUrl")
        content_path = existing.get("contentPath")
        if not pdf_url or pdf_url != existing.get("pdfUrl") or not content_path:
            continue
        try:
            with (DATA_PATH.parent / content_path).open(encoding="utf-8") as file:
                expected_sha256 = json.load(file).get("sha256")
        except (OSError, json.JSONDecodeError):
            continue
        if expected_sha256:
            candidates[item["id"]] = (pdf_url, expected_sha256)

    selected, shard_index, shard_count = select_pdf_audit_candidates(
        candidates,
        limit,
        current_date(),
    )

    changed_ids: set[str] = set()
    failed = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_by_id = {
            executor.submit(fetch_pdf_sha256, pdf_url, timeout, max_pdf_mib): (
                item_id,
                expected_sha256,
            )
            for item_id, (pdf_url, expected_sha256) in selected.items()
        }
        for index, future in enumerate(as_completed(future_by_id), start=1):
            item_id, expected_sha256 = future_by_id[future]
            fetched, actual_sha256 = future.result()
            if not fetched:
                failed += 1
            elif actual_sha256 != expected_sha256:
                changed_ids.add(item_id)
            if index % 100 == 0:
                print(f"Audited PDF content for {index}/{len(future_by_id)} ACs")

    shard_label = f"{shard_index + 1}/{shard_count}" if shard_count else "0/0"
    print(
        f"PDF content audit shard {shard_label} checked "
        f"{len(selected) - failed}/{len(selected)} ACs; {len(changed_ids)} changed, "
        f"{failed} unavailable"
    )
    return changed_ids


def build_items(
    csv_items: dict[str, dict[str, str]],
    list_items: dict[str, dict[str, str]],
    existing_items: dict[str, dict[str, Any]],
    pdf_urls: dict[str, str | None],
) -> list[dict[str, Any]]:
    numbers = sorted(set(csv_items) | set(list_items), key=natural_sort_key)
    output: list[dict[str, Any]] = []

    for number in numbers:
        csv_item = csv_items.get(number, {})
        list_item = list_items.get(number, {})
        existing = existing_items.get(number, {})
        curated = number in CURATED_NUMBERS
        title = list_item.get("title") or csv_item.get("title") or existing.get("title", "")
        office = list_item.get("office") or csv_item.get("office") or existing.get("office", "")
        category = (existing.get("category") if curated else None) or category_for(number)
        summary = (
            (existing.get("summary") if curated else "")
            or list_item.get("summary")
            or f"Official FAA advisory circular: {title}."
        )

        item: dict[str, Any] = {
            "id": existing.get("id") or slugify_ac_number(number),
            "number": number,
            "title": title,
            "status": list_item.get("status") or csv_item.get("status") or "Active",
            "issued": list_item.get("issued")
            or csv_item.get("issued")
            or existing.get("issued", ""),
            "office": office,
            "category": category,
            "summary": summary,
            "relatedCfr": (existing.get("relatedCfr") if curated else None) or [],
            "documentUrl": (
                existing.get("documentUrl") if curated else list_item.get("documentUrl")
            )
            or FAA_AC_LIST_URL,
        }

        pdf_url = pdf_urls[number] if number in pdf_urls else existing.get("pdfUrl")
        if pdf_url:
            item["pdfUrl"] = pdf_url
        if existing.get("replaces"):
            item["replaces"] = existing["replaces"]
        item["tags"] = (existing.get("tags") if curated else None) or tags_for(
            number,
            title,
            office,
            category,
        )

        if existing.get("pdfUrl") == pdf_url:
            for key in (
                "contentStatus",
                "contentPath",
                "pageCount",
                "extractedPageCount",
                "wordCount",
                "contentUpdated",
                "contentError",
            ):
                if key in existing:
                    item[key] = existing[key]

        if existing:
            item = {
                **{key: item[key] for key in existing if key in item},
                **{key: value for key, value in item.items() if key not in existing},
            }
        output.append(item)

    return output


def write_index(items: list[dict[str, Any]], updated: str) -> None:
    data = {
        "version": 2,
        "updated": updated,
        "source": "Federal Aviation Administration Advisory Circulars",
        "description": (
            "Current FAA advisory circular metadata library generated from the FAA current "
            "AC export and document list, with official FAA document pages and PDF links "
            "where published."
        ),
        "items": items,
    }
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DATA_PATH.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


def strict_source_error(
    csv_items: dict[str, dict[str, str]],
    list_items: dict[str, dict[str, str]],
) -> str | None:
    problems: list[str] = []
    if not csv_items:
        problems.append("export empty")
    if not list_items:
        problems.append("list empty")

    export_only = sorted(set(csv_items) - set(list_items), key=natural_sort_key)
    list_only = sorted(set(list_items) - set(csv_items), key=natural_sort_key)

    def summarize(numbers: list[str]) -> str:
        sample = ", ".join(numbers[:5])
        return f"{sample}, ..." if len(numbers) > 5 else sample

    if export_only:
        problems.append(f"export-only [{summarize(export_only)}]")
    if list_only:
        problems.append(f"list-only [{summarize(list_only)}]")
    if not problems:
        return None
    return "FAA source mismatch: " + "; ".join(problems)


def current_date() -> str:
    return datetime.now(ZoneInfo("America/New_York")).date().isoformat()


def write_index_if_changed(
    items: list[dict[str, Any]],
    existing_index: dict[str, Any],
    force_update: bool = False,
) -> bool:
    if not force_update and existing_index and existing_index.get("items") == items:
        return False
    write_index(items, current_date())
    return True


def write_changed_ids_file(
    path: str,
    items: list[dict[str, Any]],
    existing_index: dict[str, Any],
    additional_changed_ids: set[str] | None = None,
) -> None:
    existing_by_id = {item["id"]: item for item in existing_index.get("items", [])}
    additional_changed_ids = additional_changed_ids or set()
    changed_ids = [
        item["id"]
        for item in items
        if existing_by_id.get(item["id"]) != item or item["id"] in additional_changed_ids
    ]
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        "".join(f"{item_id}\n" for item_id in changed_ids),
        encoding="utf-8",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-pdf-fetch",
        action="store_true",
        help="Do not fetch per-document pages for PDF URLs.",
    )
    parser.add_argument(
        "--pdf-only",
        action="store_true",
        help="Enrich PDF links using existing metadata without re-fetching FAA exports.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Require nonempty FAA export and list sources with identical AC number sets.",
    )
    parser.add_argument("--csv-file", help="Use a local FAA current AC CSV export.")
    parser.add_argument("--list-file", help="Use a local FAA current AC list HTML page.")
    parser.add_argument(
        "--catalog-attempts",
        type=int,
        default=4,
        help="Maximum attempts per FAA catalog GET, including the initial request.",
    )
    parser.add_argument(
        "--catalog-timeout",
        type=int,
        default=120,
        help="Read timeout in seconds per FAA catalog request; connection timeout is 15s.",
    )
    parser.add_argument(
        "--changed-ids-file",
        help="Write newline-delimited IDs for added or changed surviving ACs.",
    )
    parser.add_argument(
        "--audit-pdf-content",
        action="store_true",
        help="Hash a rotating bounded PDF subset and flag same-URL content changes.",
    )
    parser.add_argument(
        "--pdf-audit-limit",
        type=int,
        default=100,
        help="Maximum PDFs hashed per monthly audit shard.",
    )
    parser.add_argument(
        "--pdf-audit-timeout",
        type=int,
        default=120,
        help="Per-request timeout for PDF content auditing.",
    )
    parser.add_argument(
        "--max-pdf-mib",
        type=int,
        default=150,
        help="Maximum PDF size audited per AC.",
    )
    parser.add_argument(
        "--max-workers",
        type=int,
        default=2,
        help="Maximum parallel FAA document page requests.",
    )
    args = parser.parse_args(argv)
    if args.strict and args.pdf_only:
        parser.error("--strict cannot be used with --pdf-only")
    if args.catalog_attempts < 1 or args.catalog_timeout < 1:
        parser.error("--catalog-attempts and --catalog-timeout must be positive")
    if args.audit_pdf_content and args.pdf_audit_limit < 1:
        parser.error("--pdf-audit-limit must be positive")

    session = requests.Session()
    existing_index = load_existing_index()
    existing_items = load_existing_items(existing_index)
    if args.pdf_only:
        missing_pdf_items = {
            number: item for number, item in existing_items.items() if not item.get("pdfUrl")
        }
        pdf_urls = fetch_pdf_urls(missing_pdf_items, args.max_workers)
        for number, item in existing_items.items():
            if pdf_urls.get(number):
                item["pdfUrl"] = pdf_urls[number]
        items = sorted(existing_items.values(), key=lambda item: natural_sort_key(item["number"]))
        if args.changed_ids_file:
            write_changed_ids_file(args.changed_ids_file, items, existing_index)
        changed = write_index_if_changed(items, existing_index)
        action = "Updated" if changed else "No changes to"
        print(f"{action} PDF links for {len(items)} current FAA Advisory Circulars")
        print(
            f"PDF URLs present for {sum(1 for item in items if item.get('pdfUrl'))}/{len(items)} ACs"
        )
        return 0

    csv_items = parse_csv_export(
        read_or_fetch_text(
            session,
            args.csv_file,
            FAA_AC_EXPORT_URL,
            args.catalog_attempts,
            args.catalog_timeout,
        )
    )
    list_items = parse_list_page(
        read_or_fetch_text(
            session,
            args.list_file,
            FAA_AC_LIST_URL,
            args.catalog_attempts,
            args.catalog_timeout,
        )
    )

    if args.strict:
        error = strict_source_error(csv_items, list_items)
        if error:
            print(f"Error: {error}", file=sys.stderr)
            return 1

    if len(csv_items) != len(list_items):
        print(
            f"Warning: FAA export has {len(csv_items)} rows, list page has {len(list_items)} rows",
            file=sys.stderr,
        )

    pdf_urls = {} if args.skip_pdf_fetch else fetch_pdf_urls(list_items, args.max_workers)
    items = build_items(csv_items, list_items, existing_items, pdf_urls)
    pdf_content_changed_ids: set[str] = set()
    if args.audit_pdf_content:
        pdf_content_changed_ids = audit_pdf_content(
            items,
            existing_items,
            args.max_workers,
            args.pdf_audit_timeout,
            args.max_pdf_mib,
            args.pdf_audit_limit,
        )
    if args.changed_ids_file:
        write_changed_ids_file(
            args.changed_ids_file,
            items,
            existing_index,
            pdf_content_changed_ids,
        )
    changed = write_index_if_changed(
        items,
        existing_index,
        force_update=bool(pdf_content_changed_ids),
    )
    action = "Wrote" if changed else "No changes to"
    print(
        f"{action} {len(items)} current FAA Advisory Circulars at {DATA_PATH.relative_to(ROOT_DIR)}"
    )
    print(f"PDF URLs present for {sum(1 for item in items if item.get('pdfUrl'))}/{len(items)} ACs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
