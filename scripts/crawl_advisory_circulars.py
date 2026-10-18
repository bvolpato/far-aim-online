#!/usr/bin/env python3
"""Download and extract searchable text from current FAA Advisory Circular PDFs."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
import time
import unicodedata
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from zoneinfo import ZoneInfo

import pypdfium2 as pdfium
import requests
from pypdf import PdfReader

from update_advisory_circulars import HEADERS, extract_pdf_url, fetch_text

ROOT_DIR = Path(__file__).resolve().parents[1]
AC_DIR = ROOT_DIR / "data" / "advisory-circulars"
INDEX_PATH = AC_DIR / "index.json"
CONTENT_DIR = AC_DIR / "content"
COVERAGE_PATH = AC_DIR / "coverage.json"
PUBLICATION_POLICY_PATH = AC_DIR / "publication-policy.json"
_OCR_ENGINE: Any | None = None


def clean_page_text(value: str) -> str:
    text = unicodedata.normalize("NFC", value)
    text = (
        text.replace("\x00", "")
        .replace("\u00ad", "")
        .replace("\ufffd", "")
        .replace("\ufffe", "\ue000")
    )
    text = re.sub(r"\ue000(?=(?:and|or)\b)", "- ", text, flags=re.IGNORECASE)
    text = text.replace("\ue000", "-")
    text = re.sub(r"(?<=\w)-\s*\n\s*(?=\w)", "", text)

    lines: list[str] = []
    previous_blank = True
    for raw_line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = re.sub(r"[\t \f\v]+", " ", raw_line).strip()
        if not line:
            if not previous_blank and lines:
                lines.append("")
            previous_blank = True
            continue
        if re.fullmatch(r"(?:page\s+)?\d+(?:\s+of\s+\d+)?", line, flags=re.IGNORECASE):
            continue
        line = re.sub(r"\b(Date:|AC No:|Initiated By:)(?=\S)", r"\1 ", line)
        lines.append(line)
        previous_blank = False

    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def margin_key(value: str) -> str:
    return value.casefold().strip()


def is_page_number(value: str) -> bool:
    return bool(
        re.fullmatch(
            r"(?:[ivxlcdm]+|(?:[A-Z]|\d+)[-\u2013]\d+)",
            value.strip(),
            flags=re.IGNORECASE,
        )
    )


def strip_repeated_margins(pages: list[str]) -> list[str]:
    margin_counts: Counter[str] = Counter()
    page_lines: list[list[str]] = []
    for page in pages:
        lines = page.splitlines()
        page_lines.append(lines)
        candidates = {margin_key(line) for line in lines[:2] + lines[-2:] if line.strip()}
        margin_counts.update(candidates)

    repeated: set[str] = set()
    if len(pages) >= 3:
        threshold = max(3, len(pages) // 2)
        repeated = {line for line, count in margin_counts.items() if count >= threshold}

    cleaned_pages: list[str] = []
    for lines in page_lines:
        last_index = len(lines) - 1
        kept = [
            line
            for index, line in enumerate(lines)
            if not (
                (index < 2 or index > last_index - 2)
                and line.strip()
                and (margin_key(line) in repeated or is_page_number(line))
            )
        ]
        cleaned_pages.append("\n".join(kept).strip())
    return cleaned_pages


def is_all_caps_heading(value: str) -> bool:
    letters = "".join(character for character in value if character.isalpha())
    return 3 <= len(letters) and len(value) <= 120 and letters == letters.upper()


def is_layout_entry(value: str) -> bool:
    return bool(
        re.match(r"^(?:Chapter|Appendix|Figure|Table)\b", value, flags=re.IGNORECASE)
        or re.match(r"^(?:\d+(?:\.\d+)+|[A-Z]\.\d+)\s", value)
        or re.match(r"^\d+\.\s", value)
    )


def normalize_layout_lines(lines: list[str]) -> str:
    normalized: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        continuation_line = lines[index + 1] if index + 1 < len(lines) else ""
        continuation_is_page = bool(
            re.fullmatch(r"\.+\s*(?:[A-Z][\u2013-]?)?\d+", continuation_line)
        )
        if (
            index + 1 < len(lines)
            and is_layout_entry(line)
            and (
                (
                    not re.search(r"\.{2,}", line)
                    and re.search(r"\.{2,}", continuation_line)
                    and not is_layout_entry(continuation_line)
                )
                or continuation_is_page
            )
        ):
            continuation = re.sub(r"^\.+\s*", "", continuation_line)
            line = f"{line} {continuation}"
            index += 1
        normalized.append(re.sub(r"\s*\.{2,}\s*", "  ", line).strip())
        index += 1
    return "\n".join(normalized)


def reflow_page_text(value: str) -> str:
    lines = value.splitlines()
    if not lines:
        return ""

    layout_markers = sum(bool(re.search(r"\.{2,}\s*\S+$", line)) for line in lines)
    page_headings = {line.upper() for line in lines[:5]}
    has_labeled_layout = any(
        re.match(r"^(?:Figure|Table)\s+[A-Z0-9-]+[.:]", line, flags=re.IGNORECASE)
        for line in lines[:15]
    )
    numeric_rows = sum(len(re.findall(r"(?<!\w)[+-]?\d[\d.,%/-]*", line)) >= 3 for line in lines)
    if (
        layout_markers >= 3
        or page_headings.intersection({"FIGURES", "TABLES"})
        or has_labeled_layout
        or numeric_rows >= 3
    ):
        return normalize_layout_lines(lines)

    paragraphs: list[str] = []
    current: list[str] = []

    def flush() -> None:
        if current:
            paragraphs.append(" ".join(current))
            current.clear()

    for line in lines:
        if not line:
            flush()
            continue

        dotted_leader = bool(re.search(r"\.{2,}\s*\S+$", line))
        numbered = bool(re.match(r"^(?:\d+(?:\.\d+)+|[A-Z]\.\d+)\s+", line))
        short_numbered_heading = numbered and len(line) <= 120 and line.endswith((".", "]", ":"))
        structural_heading = (
            is_all_caps_heading(line)
            or bool(re.match(r"^(?:CHAPTER|APPENDIX)\b", line, flags=re.IGNORECASE))
            or line in {"Paragraph Page", "Number Page"}
        )

        if dotted_leader or structural_heading or short_numbered_heading:
            flush()
            paragraphs.append(line)
            continue

        if numbered or line.startswith(("Subject:", "This advisory circular")):
            flush()
        elif (
            current
            and current[0].startswith("This advisory circular")
            and current[-1].endswith(".")
            and len(line.split()) <= 6
        ):
            flush()
        current.append(line)

    flush()
    return "\n\n".join(paragraphs)


def repair_cover_metadata(text: str, issued: str | None) -> str:
    pattern = r"\bDate:[ \t]*(?P<suffix>AC No:|\n|$)"
    if not issued or not re.search(pattern, text):
        return text
    try:
        formatted = datetime.strptime(issued, "%Y-%m-%d").strftime("%m/%d/%Y")
    except ValueError:
        return text

    def replacement(match: re.Match[str]) -> str:
        suffix = match.group("suffix")
        separator = " " if suffix == "AC No:" else ""
        return f"Date: {formatted}{separator}{suffix}"

    return re.sub(pattern, replacement, text, count=1)


def supplement_sparse_pages_with_pypdf(pdf_bytes: bytes, extracted: list[str]) -> list[str]:
    sparse_indexes = {
        index for index, text in enumerate(extracted) if len(re.findall(r"\b\w+\b", text)) < 25
    }
    if not sparse_indexes:
        return extracted

    try:
        reader = PdfReader(BytesIO(pdf_bytes), strict=False)
        if reader.is_encrypted:
            reader.decrypt("")
        for index in sparse_indexes:
            if index >= len(reader.pages):
                continue
            fallback = clean_page_text(reader.pages[index].extract_text() or "")
            if len(fallback) > len(extracted[index]):
                extracted[index] = fallback
    except Exception:
        pass
    return extracted


def ocr_sparse_pages(pdf_bytes: bytes, extracted: list[str]) -> tuple[list[str], int]:
    if not any(len(re.findall(r"\b\w+\b", text)) < 25 for text in extracted):
        return extracted, 0
    try:
        from rapidocr import RapidOCR
    except ImportError as error:
        raise RuntimeError("OCR dependencies missing; run with `uv sync --extra ocr`") from error

    global _OCR_ENGINE
    if _OCR_ENGINE is None:
        _OCR_ENGINE = RapidOCR(
            params={
                "EngineConfig.onnxruntime.intra_op_num_threads": 2,
                "EngineConfig.onnxruntime.inter_op_num_threads": 1,
            }
        )

    document = pdfium.PdfDocument(pdf_bytes)
    ocr_page_count = 0
    try:
        for index, text in enumerate(extracted):
            if len(re.findall(r"\b\w+\b", text)) >= 25:
                continue

            page = document[index]
            bitmap = page.render(scale=2)
            image = bitmap.to_pil()
            try:
                output = _OCR_ENGINE(image)
                lines = [
                    value
                    for value, score in zip(output.txts or [], output.scores or [], strict=False)
                    if score >= 0.45
                ]
                ocr_text = clean_page_text("\n".join(lines))
                if len(ocr_text) > len(text):
                    extracted[index] = ocr_text
                    ocr_page_count += 1
            finally:
                image.close()
                bitmap.close()
                page.close()
    finally:
        document.close()

    return extracted, ocr_page_count


def extract_pdf_content(
    pdf_bytes: bytes,
    use_ocr: bool | None = None,
) -> tuple[list[dict[str, Any]], int, int]:
    document = pdfium.PdfDocument(pdf_bytes)
    page_count = len(document)
    extracted: list[str] = []
    for index in range(page_count):
        page = document[index]
        text_page = None
        try:
            text_page = page.get_textpage()
            extracted.append(clean_page_text(text_page.get_text_range()))
        except Exception:
            extracted.append("")
        finally:
            if text_page is not None:
                text_page.close()
            page.close()
    document.close()

    extracted = supplement_sparse_pages_with_pypdf(pdf_bytes, extracted)

    ocr_page_count = 0
    if use_ocr or (use_ocr is None and ocr_available()):
        extracted, ocr_page_count = ocr_sparse_pages(pdf_bytes, extracted)

    cleaned_pages = [reflow_page_text(text) for text in strip_repeated_margins(extracted)]
    pages = [
        {"page": page_number, "text": text}
        for page_number, text in enumerate(cleaned_pages, start=1)
        if text
    ]
    return pages, page_count, ocr_page_count


def word_count(pages: list[dict[str, Any]]) -> int:
    return sum(len(re.findall(r"\b[\w'-]+\b", page["text"])) for page in pages)


def extraction_status(pages: list[dict[str, Any]], page_count: int) -> str:
    """Parsed means text on every page, not preservation of figures or PDF layout."""
    words = word_count(pages)
    extracted_pages = {page["page"] for page in pages if page["text"].strip()}
    expected_pages = set(range(1, page_count + 1))
    return "parsed" if words >= 100 and extracted_pages == expected_pages else "partial"


def ocr_available() -> bool:
    return importlib.util.find_spec("rapidocr") is not None


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write("\n")


def publication_exclusion(item: dict[str, Any]) -> dict[str, Any] | None:
    policy = load_json(PUBLICATION_POLICY_PATH)
    reason = policy.get("excludedOfflineText", {}).get(item["id"])
    if reason:
        return {"id": item["id"], "status": "unavailable", "error": reason}
    return None


def validate_cached_content(item: dict[str, Any], content: dict[str, Any]) -> None:
    if not isinstance(content, dict):
        raise ValueError("Content must be a JSON object")
    for key in ("id", "number", "title", "documentUrl", "pdfUrl"):
        if content.get(key) != item.get(key):
            raise ValueError(f"Content {key} differs from index")
    if not re.fullmatch(r"[0-9a-f]{64}", content.get("sha256", "")):
        raise ValueError("Missing or invalid source PDF SHA-256")
    page_count = content.get("pageCount")
    if type(page_count) is not int or page_count < 1:
        raise ValueError("PDF pageCount must be a positive integer")
    pages = content.get("pages")
    if not isinstance(pages, list):
        raise ValueError("Content pages must be a list")
    previous_page = 0
    for page in pages:
        if not isinstance(page, dict):
            raise ValueError("Page must be an object")
        number = page.get("page")
        if type(number) is not int or not previous_page < number <= page_count:
            raise ValueError("Page numbers must be unique, ordered, and within pageCount")
        if not isinstance(page.get("text"), str) or not page["text"].strip():
            raise ValueError("Extracted pages must have nonempty text")
        previous_page = number
    if content.get("extractedPageCount", len(pages)) != len(pages):
        raise ValueError("extractedPageCount differs from page payload")
    if content.get("wordCount") != word_count(pages):
        raise ValueError("wordCount differs from page payload")
    if content.get("status") != extraction_status(pages, page_count):
        raise ValueError("Content status differs from page text coverage")
    ocr_pages = content.get("ocrPageCount", 0)
    if type(ocr_pages) is not int or not 0 <= ocr_pages <= len(pages):
        raise ValueError("ocrPageCount exceeds extracted pages")


def existing_result(item: dict[str, Any]) -> dict[str, Any] | None:
    excluded = publication_exclusion(item)
    if excluded:
        return excluded
    content_path = item.get("contentPath") or f"content/{item['id']}.json"
    path = AC_DIR / content_path
    if not path.exists():
        return None
    try:
        content = load_json(path)
        validate_cached_content(item, content)
    except (OSError, ValueError, TypeError):
        return None
    extracted_page_count = len(content.get("pages", []))
    return {
        "id": item["id"],
        "status": content.get("status", "partial"),
        "pageCount": content.get("pageCount", 0),
        "extractedPageCount": extracted_page_count,
        "wordCount": content.get("wordCount", 0),
        "ocrPageCount": content.get("ocrPageCount", 0),
        "contentPath": content_path,
        "sha256": content.get("sha256", ""),
    }


def download_pdf(pdf_url: str, timeout: int, max_pdf_mib: int, attempts: int = 4) -> bytes:
    for attempt in range(attempts):
        try:
            with requests.get(pdf_url, headers=HEADERS, timeout=timeout, stream=True) as response:
                response.raise_for_status()
                chunks: list[bytes] = []
                size = 0
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    size += len(chunk)
                    if size > max_pdf_mib * 1024 * 1024:
                        raise ValueError(f"PDF exceeds {max_pdf_mib} MiB limit")
                    chunks.append(chunk)
                pdf_bytes = b"".join(chunks)
                if not pdf_bytes.startswith(b"%PDF"):
                    raise ValueError("FAA asset is not a PDF")
                return pdf_bytes
        except requests.RequestException as error:
            status_code = error.response.status_code if error.response is not None else None
            retryable = status_code is None or status_code == 429 or status_code >= 500
            if attempt + 1 == attempts or not retryable:
                raise
            time.sleep(2**attempt)

    raise RuntimeError("PDF download attempts exhausted")


def current_pdf_url(document_url: str, timeout: int) -> str | None:
    with requests.Session() as session:
        return extract_pdf_url(fetch_text(session, document_url, timeout=timeout))


def crawl_item(
    item: dict[str, Any],
    timeout: int,
    max_pdf_mib: int,
    use_ocr: bool | None,
    resolve_pdf_url: bool = False,
    output_dir: Path | None = None,
) -> dict[str, Any]:
    excluded = publication_exclusion(item)
    if excluded:
        return excluded
    pdf_url = item.get("pdfUrl")
    if resolve_pdf_url:
        try:
            pdf_url = current_pdf_url(item["documentUrl"], timeout)
        except requests.RequestException as error:
            return {"id": item["id"], "status": "failed", "error": str(error)}
        if not pdf_url:
            return {
                "id": item["id"],
                "status": "unavailable",
                "pdfUrl": None,
                "error": "No PDF published",
            }
    elif not pdf_url:
        try:
            pdf_url = current_pdf_url(item["documentUrl"], timeout)
        except requests.RequestException as error:
            return {"id": item["id"], "status": "failed", "error": str(error)}
        if not pdf_url:
            return {
                "id": item["id"],
                "status": "unavailable",
                "pdfUrl": None,
                "error": "No PDF published",
            }

    try:
        try:
            pdf_bytes = download_pdf(pdf_url, timeout, max_pdf_mib)
        except requests.HTTPError as error:
            if error.response is None or error.response.status_code != 404:
                raise
            refreshed_pdf_url = current_pdf_url(item["documentUrl"], timeout)
            if not refreshed_pdf_url or refreshed_pdf_url == pdf_url:
                raise
            pdf_url = refreshed_pdf_url
            pdf_bytes = download_pdf(pdf_url, timeout, max_pdf_mib)

        pages, page_count, ocr_page_count = extract_pdf_content(pdf_bytes, use_ocr)
        if pages and pages[0]["page"] == 1:
            pages[0]["text"] = repair_cover_metadata(pages[0]["text"], item.get("issued"))
        words = word_count(pages)
        status = extraction_status(pages, page_count)
        fetched = datetime.now(ZoneInfo("America/New_York")).date().isoformat()
        digest = hashlib.sha256(pdf_bytes).hexdigest()
        content_path = f"content/{item['id']}.json"
        write_json(
            output_dir / f"{item['id']}.json" if output_dir is not None else AC_DIR / content_path,
            {
                "version": 1,
                "id": item["id"],
                "number": item["number"],
                "title": item["title"],
                "status": status,
                "fetched": fetched,
                "documentUrl": item["documentUrl"],
                "pdfUrl": pdf_url,
                "sha256": digest,
                "pageCount": page_count,
                "extractedPageCount": len(pages),
                "wordCount": words,
                "ocrPageCount": ocr_page_count,
                "pages": pages,
            },
        )
        return {
            "id": item["id"],
            "status": status,
            "pageCount": page_count,
            "extractedPageCount": len(pages),
            "wordCount": words,
            "ocrPageCount": ocr_page_count,
            "contentPath": content_path,
            "pdfUrl": pdf_url,
            "sha256": digest,
        }
    except Exception as error:
        return {"id": item["id"], "status": "failed", "error": str(error)}


def update_index(
    items: list[dict[str, Any]],
    results: list[dict[str, Any]],
    selected_ids: set[str],
    updated: str,
    refreshed_ids: set[str],
) -> None:
    result_by_id = {result["id"]: result for result in results}
    for item in items:
        if item["id"] not in selected_ids:
            continue
        result = result_by_id[item["id"]]
        if "pdfUrl" in result:
            if result["pdfUrl"]:
                item["pdfUrl"] = result["pdfUrl"]
            else:
                item.pop("pdfUrl", None)
        item["contentStatus"] = result["status"]
        excluded = publication_exclusion(item)
        if excluded:
            item["contentError"] = excluded["error"]
        else:
            item.pop("contentError", None)
        if result.get("contentPath"):
            item["contentPath"] = result["contentPath"]
            item["pageCount"] = result["pageCount"]
            item["extractedPageCount"] = result["extractedPageCount"]
            item["wordCount"] = result["wordCount"]
            if item["id"] in refreshed_ids:
                item["contentUpdated"] = updated
        else:
            for key in (
                "contentPath",
                "pageCount",
                "extractedPageCount",
                "wordCount",
                "contentUpdated",
            ):
                item.pop(key, None)


def remove_unreferenced_content(items: list[dict[str, Any]]) -> None:
    referenced = {item["contentPath"] for item in items if item.get("contentPath")}
    for path in CONTENT_DIR.glob("*.json"):
        relative_path = path.relative_to(AC_DIR).as_posix()
        if relative_path not in referenced:
            path.unlink()


def check_cache() -> list[str]:
    """Audit every local payload and its indexes without requests or file writes."""
    errors: list[str] = []
    index = load_json(INDEX_PATH)
    coverage = load_json(COVERAGE_PATH)
    items = index.get("items", [])
    results = coverage.get("items", [])
    item_ids = [item["id"] for item in items]
    result_ids = [result["id"] for result in results]
    if len(set(item_ids)) != len(item_ids) or len(set(result_ids)) != len(result_ids):
        errors.append("Duplicate AC IDs in index or coverage")
    if set(item_ids) != set(result_ids):
        errors.append("Coverage IDs differ from index")
    counts = dict(sorted(Counter(result.get("status") for result in results).items()))
    if coverage.get("counts") != counts or coverage.get("total") != len(items):
        errors.append("Coverage totals or counts differ from items")
    result_by_id = {result["id"]: result for result in results}
    referenced: set[str] = set()
    for item in items:
        item_id = item["id"]
        result = result_by_id.get(item_id, {})
        excluded = publication_exclusion(item)
        if excluded:
            if item.get("contentStatus") != "unavailable" or item.get("contentPath"):
                errors.append(f"{item_id}: publication exclusion has bundled text")
            if item.get("contentError") != excluded["error"]:
                errors.append(f"{item_id}: publication exclusion reason differs from policy")
            expected = excluded
        elif item.get("contentStatus") == "unavailable":
            if item.get("pdfUrl") or item.get("contentPath"):
                errors.append(f"{item_id}: unavailable item has a PDF or cached payload")
            expected = {"id": item_id, "status": "unavailable"}
        else:
            content_path = item.get("contentPath")
            if content_path != f"content/{item_id}.json":
                errors.append(f"{item_id}: missing or unexpected contentPath")
                continue
            referenced.add(content_path)
            try:
                content = load_json(AC_DIR / content_path)
                validate_cached_content(item, content)
            except (OSError, ValueError, TypeError) as error:
                errors.append(f"{item_id}: {error}")
                continue
            expected = existing_result(item)
            assert expected is not None
            for key in ("pageCount", "extractedPageCount", "wordCount"):
                if item.get(key) != expected[key]:
                    errors.append(f"{item_id}: index {key} differs from payload")
            if item.get("contentStatus") != expected["status"]:
                errors.append(f"{item_id}: index status differs from page text coverage")
        for key, value in expected.items():
            if result.get(key) != value:
                errors.append(f"{item_id}: coverage {key} differs from payload")
        if expected["status"] == "unavailable" and result.get("contentPath"):
            errors.append(f"{item_id}: unavailable coverage references cached text")
        if result.get("refreshError"):
            errors.append(f"{item_id}: unresolved refresh failure: {result['refreshError']}")
    for path in CONTENT_DIR.glob("*.json"):
        if path.relative_to(AC_DIR).as_posix() not in referenced:
            errors.append(f"{path.name}: unreferenced content payload")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--id", action="append", dest="ids", help="Only crawl one AC id; repeatable."
    )
    parser.add_argument("--limit", type=int, help="Limit selected ACs for parser validation.")
    parser.add_argument("--refresh", action="store_true", help="Re-download existing content.")
    parser.add_argument(
        "--check", action="store_true", help="Audit all cached content without network or writes."
    )
    parser.add_argument(
        "--ocr",
        action="store_true",
        default=None,
        help="Require OCR on sparse pages. OCR is automatic when optional dependencies are installed.",
    )
    parser.add_argument(
        "--resolve-pdf-url",
        action="store_true",
        help="Resolve each selected document's current PDF URL before refresh.",
    )
    parser.add_argument("--max-workers", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--max-pdf-mib", type=int, default=150)
    args = parser.parse_args(argv)
    if args.check:
        try:
            errors = check_cache()
        except (OSError, ValueError, KeyError, TypeError) as error:
            errors = [str(error)]
        for error in errors:
            print(f"AC cache audit failed: {error}", file=sys.stderr)
        if not errors:
            print("AC cache audit passed: every payload matches index and coverage text counts.")
        return int(bool(errors))
    if args.resolve_pdf_url and not args.refresh:
        parser.error("--resolve-pdf-url requires --refresh")
    if min(args.max_workers, args.timeout, args.max_pdf_mib) < 1:
        parser.error("--max-workers, --timeout, and --max-pdf-mib must be positive")
    if args.ocr and not ocr_available():
        parser.error("OCR dependencies missing; run with `uv sync --extra ocr`")

    index = load_json(INDEX_PATH)
    items = index.get("items", [])
    original_items = json.dumps(items, sort_keys=True)
    previous_results = {}
    if COVERAGE_PATH.exists():
        previous_results = {
            result["id"]: result for result in load_json(COVERAGE_PATH).get("items", [])
        }
    selected = [item for item in items if not args.ids or item["id"] in set(args.ids)]
    if args.limit is not None:
        selected = selected[: args.limit]

    results: list[dict[str, Any]] = []
    pending: list[dict[str, Any]] = []
    fallback_by_id: dict[str, dict[str, Any]] = {}
    for item in selected:
        cached = existing_result(item)
        if cached is not None:
            fallback_by_id[item["id"]] = cached
        if cached is not None and not args.refresh:
            results.append(cached)
        else:
            pending.append(item)

    selected_ids = {item["id"] for item in selected}
    pending_ids = {item["id"] for item in pending}
    for item in items:
        if item["id"] not in selected_ids:
            results.append(
                existing_result(item)
                or (
                    previous_results.get(item["id"])
                    if item.get("contentStatus") == "unavailable"
                    and not item.get("pdfUrl")
                    and previous_results.get(item["id"], {}).get("status") == "unavailable"
                    else None
                )
                or {
                    "id": item["id"],
                    "status": "failed",
                    "error": "Nonselected AC has missing, invalid, or stale cached content",
                }
            )

    refresh_failures = 0
    worker_count = 1 if args.ocr or ocr_available() else args.max_workers
    with TemporaryDirectory(prefix=".ac-refresh-", dir=AC_DIR) as temporary_dir:
        staging_dir = Path(temporary_dir)
        with ProcessPoolExecutor(max_workers=worker_count) as executor:
            future_by_item = {
                executor.submit(
                    crawl_item,
                    item,
                    args.timeout,
                    args.max_pdf_mib,
                    args.ocr,
                    args.resolve_pdf_url,
                    staging_dir,
                ): item
                for item in pending
            }
            for completed, future in enumerate(as_completed(future_by_item), start=1):
                result = future.result()
                if result["status"] == "failed" and result["id"] in fallback_by_id:
                    refresh_failures += 1
                    result = {
                        **fallback_by_id[result["id"]],
                        "refreshError": result["error"],
                    }
                results.append(result)
                if completed % 25 == 0 or completed == len(future_by_item):
                    print(f"Processed {completed}/{len(future_by_item)} AC PDFs", flush=True)

        counts = Counter(result["status"] for result in results)
        if counts.get("failed", 0) or refresh_failures:
            for result in results:
                if result.get("status") == "failed" or result.get("refreshError"):
                    print(
                        f"AC refresh failed: {result['id']}: {result.get('error') or result.get('refreshError')}",
                        file=sys.stderr,
                    )
            return 1
        CONTENT_DIR.mkdir(parents=True, exist_ok=True)
        for path in staging_dir.glob("*.json"):
            path.replace(CONTENT_DIR / path.name)
    selected_ids.update(item["id"] for item in items if publication_exclusion(item))
    results.sort(key=lambda result: result["id"])
    today = datetime.now(ZoneInfo("America/New_York")).date().isoformat()
    update_index(items, results, selected_ids, today, pending_ids)
    if json.dumps(items, sort_keys=True) != original_items:
        index["updated"] = today
    remove_unreferenced_content(items)
    write_json(INDEX_PATH, index)

    write_json(
        COVERAGE_PATH,
        {
            "version": 1,
            "updated": index.get("updated", today),
            "total": len(items),
            "counts": dict(sorted(counts.items())),
            "items": results,
        },
    )
    print("Coverage: " + ", ".join(f"{status}={count}" for status, count in sorted(counts.items())))
    return 1 if counts.get("failed", 0) or refresh_failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
