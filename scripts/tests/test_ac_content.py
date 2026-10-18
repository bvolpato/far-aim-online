import copy
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from unittest.mock import Mock

import pytest
from pypdf import PdfWriter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import crawl_advisory_circulars as crawler  # noqa: E402


@pytest.fixture
def cached_snapshot(tmp_path, monkeypatch):
    monkeypatch.setattr(crawler, "AC_DIR", tmp_path)
    monkeypatch.setattr(crawler, "CONTENT_DIR", tmp_path / "content")
    monkeypatch.setattr(crawler, "INDEX_PATH", tmp_path / "index.json")
    monkeypatch.setattr(crawler, "COVERAGE_PATH", tmp_path / "coverage.json")
    monkeypatch.setattr(crawler, "PUBLICATION_POLICY_PATH", tmp_path / "publication-policy.json")
    crawler.write_json(crawler.PUBLICATION_POLICY_PATH, {"excludedOfflineText": {}})
    item = {
        "id": "ac-20-1",
        "number": "20-1",
        "title": "Guidance",
        "documentUrl": "https://www.faa.gov/ac",
        "pdfUrl": "https://www.faa.gov/ac.pdf",
        "contentPath": "content/ac-20-1.json",
        "contentStatus": "parsed",
        "pageCount": 1,
        "extractedPageCount": 1,
        "wordCount": 100,
    }
    content = {
        **item,
        "status": "parsed",
        "sha256": "a" * 64,
        "ocrPageCount": 0,
        "pages": [{"page": 1, "text": "word " * 100}],
    }
    crawler.write_json(tmp_path / item["contentPath"], content)
    result = crawler.existing_result(item)
    crawler.write_json(crawler.INDEX_PATH, {"items": [item]})
    crawler.write_json(
        crawler.COVERAGE_PATH, {"total": 1, "counts": {"parsed": 1}, "items": [result]}
    )
    return tmp_path, item, content


def test_cache_audit_is_offline_and_preserves_every_byte(cached_snapshot, monkeypatch):
    directory, _item, _content = cached_snapshot
    original = {path: path.read_bytes() for path in directory.rglob("*") if path.is_file()}
    monkeypatch.setattr(crawler.requests, "get", Mock(side_effect=AssertionError("network")))
    monkeypatch.setattr(crawler.requests, "Session", Mock(side_effect=AssertionError("network")))
    assert crawler.main(["--check"]) == 0
    assert {path: path.read_bytes() for path in directory.rglob("*") if path.is_file()} == original


@pytest.mark.parametrize(
    "corruption",
    [
        "missing",
        "invalid-json",
        "word-count",
        "duplicate-pages",
        "false-status",
        "index-count",
        "coverage-status",
    ],
)
def test_cache_audit_rejects_invalid_payload_without_mutation(cached_snapshot, corruption):
    directory, item, content = cached_snapshot
    path = directory / item["contentPath"]
    if corruption == "missing":
        path.unlink()
    elif corruption == "invalid-json":
        path.write_text("{")
    elif corruption == "index-count":
        item["pageCount"] = 2
        crawler.write_json(crawler.INDEX_PATH, {"items": [item]})
    elif corruption == "coverage-status":
        coverage = json.loads(crawler.COVERAGE_PATH.read_text())
        coverage["items"][0]["status"] = "partial"
        crawler.write_json(crawler.COVERAGE_PATH, coverage)
    else:
        if corruption == "word-count":
            content["pages"][0]["text"] = "shortened"
        elif corruption == "duplicate-pages":
            content["pages"] *= 2
        elif corruption == "false-status":
            content["pageCount"] = 2
        crawler.write_json(path, content)
    before = {p: p.read_bytes() for p in directory.rglob("*") if p.is_file()}
    assert crawler.main(["--check"]) == 1
    assert {p: p.read_bytes() for p in directory.rglob("*") if p.is_file()} == before


def test_subset_cannot_claim_stale_coverage_for_missing_nonselected_cache(cached_snapshot):
    directory, item, _content = cached_snapshot
    (directory / item["contentPath"]).unlink()
    before = {p: p.read_bytes() for p in directory.rglob("*") if p.is_file()}
    assert crawler.main(["--id", "another-record"]) == 1
    assert {p: p.read_bytes() for p in directory.rglob("*") if p.is_file()} == before


def test_content_only_refresh_keeps_index_and_coverage_dates_in_sync(cached_snapshot, monkeypatch):
    directory, item, content = cached_snapshot
    index = json.loads(crawler.INDEX_PATH.read_text())
    index["updated"] = "2020-01-01"
    crawler.write_json(crawler.INDEX_PATH, index)
    content.update(status="partial", pageCount=2)
    crawler.write_json(directory / item["contentPath"], content)
    refreshed = crawler.existing_result(item)
    monkeypatch.setattr(crawler, "ProcessPoolExecutor", ThreadPoolExecutor)
    monkeypatch.setattr(crawler, "crawl_item", lambda *_args: refreshed)
    assert crawler.main(["--refresh"]) == 0
    after_index = json.loads(crawler.INDEX_PATH.read_text())
    coverage = json.loads(crawler.COVERAGE_PATH.read_text())
    assert after_index["updated"] != "2020-01-01"
    assert after_index["updated"] == coverage["updated"]
    assert after_index["items"][0]["contentStatus"] == "partial"
    assert crawler.main(["--check"]) == 0


def test_failed_batch_preserves_cache_and_single_record_retry_stays_consistent(
    cached_snapshot, monkeypatch
):
    directory, first, content = cached_snapshot
    second = {
        **first,
        "id": "ac-20-2",
        "number": "20-2",
        "documentUrl": "https://www.faa.gov/ac-20-2",
        "pdfUrl": "https://www.faa.gov/ac-20-2.pdf",
        "contentPath": "content/ac-20-2.json",
    }
    crawler.write_json(directory / second["contentPath"], {**content, **second})
    crawler.write_json(crawler.INDEX_PATH, {"items": [first, second]})
    crawler.write_json(
        crawler.COVERAGE_PATH,
        {
            "total": 2,
            "counts": {"parsed": 2},
            "items": [crawler.existing_result(item) for item in (first, second)],
        },
    )
    before = {p: p.read_bytes() for p in directory.rglob("*") if p.is_file()}
    fail_second = True

    def download(url, *_args):
        nonlocal fail_second
        if url == second["pdfUrl"] and fail_second:
            fail_second = False
            raise crawler.requests.ReadTimeout("Second AC unavailable")
        return b"%PDF-refreshed"

    monkeypatch.setattr(crawler, "ProcessPoolExecutor", ThreadPoolExecutor)
    monkeypatch.setattr(crawler, "download_pdf", download)
    monkeypatch.setattr(
        crawler,
        "extract_pdf_content",
        lambda *_args: ([{"page": 1, "text": "refreshed " * 200}], 1, 0),
    )
    assert crawler.main(["--refresh", "--max-workers", "1"]) == 1
    assert {p: p.read_bytes() for p in directory.rglob("*") if p.is_file()} == before
    assert crawler.main(["--check"]) == 0

    assert crawler.main(["--refresh", "--id", second["id"]]) == 0
    assert crawler.main(["--check"]) == 0
    after_index = json.loads(crawler.INDEX_PATH.read_text())
    assert [item["wordCount"] for item in after_index["items"]] == [100, 200]

    assert crawler.main(["--refresh", "--id", first["id"]]) == 0
    assert crawler.main(["--check"]) == 0
    after_index = json.loads(crawler.INDEX_PATH.read_text())
    assert [item["wordCount"] for item in after_index["items"]] == [200, 200]


def test_missing_pdf_metadata_transport_failure_is_failed_not_unavailable(
    cached_snapshot, monkeypatch
):
    _directory, item, _content = cached_snapshot
    item = copy.deepcopy(item)
    item.pop("pdfUrl")
    monkeypatch.setattr(
        crawler, "current_pdf_url", Mock(side_effect=crawler.requests.ReadTimeout("FAA timed out"))
    )
    result = crawler.crawl_item(item, 30, 10, False)
    assert result["status"] == "failed"
    assert result["error"] == "FAA timed out"


def test_current_pdf_url_retries_transient_metadata_errors(monkeypatch):
    response = crawler.requests.Response()
    response.status_code = 200
    response._content = b'<a href="/documentLibrary/media/Advisory_Circular/AC.pdf">AC</a>'
    response._content_consumed = True
    session = Mock(spec=crawler.requests.Session)
    session.__enter__ = Mock(return_value=session)
    session.__exit__ = Mock(return_value=None)
    session.get.side_effect = [
        crawler.requests.ReadTimeout("FAA temporarily unavailable"),
        response,
    ]
    monkeypatch.setattr(crawler.requests, "Session", lambda: session)
    monkeypatch.setattr(crawler.time, "sleep", lambda _delay: None)
    assert (
        crawler.current_pdf_url("https://www.faa.gov/ac", 30)
        == "https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC.pdf"
    )
    assert session.get.call_count == 2


def test_download_stops_reading_at_size_limit_and_closes_response(monkeypatch):
    response = Mock()
    response.content = b"%PDF" + b"a" * (1200 * 1024)
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=None)
    consumed: list[int] = []

    def chunks(**_kwargs):
        for index in range(3):
            consumed.append(index)
            yield b"%PDF" + b"a" * (600 * 1024)

    response.iter_content.side_effect = chunks
    request = Mock(return_value=response)
    monkeypatch.setattr(crawler.requests, "get", request)
    with pytest.raises(ValueError, match="exceeds 1 MiB"):
        crawler.download_pdf("https://www.faa.gov/ac.pdf", 30, 1)
    assert consumed == [0, 1]
    assert request.call_args.kwargs["stream"] is True
    response.__exit__.assert_called_once()


def test_automatic_ocr_supplements_sparse_pages_when_available(monkeypatch):
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buffer = BytesIO()
    writer.write(buffer)
    monkeypatch.setattr(crawler, "ocr_available", lambda: True)
    ocr = Mock(return_value=(["OCR text " * 100], 1))
    monkeypatch.setattr(crawler, "ocr_sparse_pages", ocr)
    pages, page_count, ocr_count = crawler.extract_pdf_content(buffer.getvalue())
    assert page_count == 1
    assert ocr_count == 1
    assert pages[0]["text"].startswith("OCR text")
    ocr.assert_called_once()
