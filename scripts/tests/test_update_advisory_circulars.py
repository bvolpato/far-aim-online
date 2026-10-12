import json
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import update_advisory_circulars as updater  # noqa: E402


def catalog_response(status: int = 200, retry_after: str | None = None):
    response = updater.requests.Response()
    response.status_code = status
    response.url = updater.FAA_AC_LIST_URL
    response._content = b"FAA catalog"
    response._content_consumed = True
    if retry_after is not None:
        response.headers["Retry-After"] = retry_after
    return response


@pytest.mark.parametrize(
    "error_type",
    [
        updater.requests.ReadTimeout,
        updater.requests.ConnectTimeout,
        updater.requests.ConnectionError,
        updater.requests.exceptions.ChunkedEncodingError,
    ],
)
def test_catalog_fetch_recovers_from_transient_transport_failure(monkeypatch, capsys, error_type):
    session = Mock(spec=updater.requests.Session)
    session.get.side_effect = [error_type("FAA temporarily unavailable"), catalog_response()]
    sleeps: list[int] = []
    monkeypatch.setattr(updater.time, "sleep", sleeps.append)

    assert updater.fetch_text(session, updater.FAA_AC_LIST_URL) == "FAA catalog"

    assert session.get.call_count == 2
    session.get.assert_called_with(
        updater.FAA_AC_LIST_URL,
        headers=updater.HEADERS,
        timeout=(15, 120),
    )
    assert sleeps == [2]
    assert "request 1/4 failed" in capsys.readouterr().err


@pytest.mark.parametrize("status", [408, 429, 500, 502, 503, 504])
def test_catalog_fetch_recovers_from_transient_http_status(monkeypatch, status):
    session = Mock(spec=updater.requests.Session)
    session.get.side_effect = [catalog_response(status), catalog_response()]
    sleeps: list[int] = []
    monkeypatch.setattr(updater.time, "sleep", sleeps.append)

    assert updater.fetch_text(session, updater.FAA_AC_LIST_URL) == "FAA catalog"

    assert session.get.call_count == 2
    assert sleeps == [2]


@pytest.mark.parametrize("retry_after, expected_delay", [("10", 10), ("600", 30), ("bad", 2)])
def test_catalog_retry_after_is_bounded(monkeypatch, retry_after, expected_delay):
    session = Mock(spec=updater.requests.Session)
    session.get.side_effect = [catalog_response(429, retry_after), catalog_response()]
    sleeps: list[int] = []
    monkeypatch.setattr(updater.time, "sleep", sleeps.append)

    assert updater.fetch_text(session, updater.FAA_AC_LIST_URL) == "FAA catalog"

    assert sleeps == [expected_delay]


@pytest.mark.parametrize("status", [400, 401, 403, 404, 410])
def test_catalog_fetch_does_not_retry_permanent_http_errors(monkeypatch, status):
    session = Mock(spec=updater.requests.Session)
    session.get.return_value = catalog_response(status)
    sleep = Mock()
    monkeypatch.setattr(updater.time, "sleep", sleep)

    with pytest.raises(updater.requests.HTTPError) as caught:
        updater.fetch_text(session, updater.FAA_AC_LIST_URL)

    assert caught.value.response.status_code == status
    assert session.get.call_count == 1
    sleep.assert_not_called()


@pytest.mark.parametrize(
    "error_type",
    [updater.requests.exceptions.InvalidURL, updater.requests.exceptions.SSLError],
)
def test_catalog_fetch_does_not_retry_invalid_url_or_certificate(monkeypatch, error_type):
    session = Mock(spec=updater.requests.Session)
    error = error_type("permanent failure")
    session.get.side_effect = error
    sleep = Mock()
    monkeypatch.setattr(updater.time, "sleep", sleep)

    with pytest.raises(error_type) as caught:
        updater.fetch_text(session, updater.FAA_AC_LIST_URL)

    assert caught.value is error
    assert session.get.call_count == 1
    sleep.assert_not_called()


def test_catalog_fetch_stops_at_attempt_limit_and_preserves_last_error(monkeypatch):
    session = Mock(spec=updater.requests.Session)
    errors = [updater.requests.ReadTimeout(f"read timeout {index}") for index in range(4)]
    session.get.side_effect = errors
    sleeps: list[int] = []
    monkeypatch.setattr(updater.time, "sleep", sleeps.append)

    with pytest.raises(updater.requests.ReadTimeout) as caught:
        updater.fetch_text(session, updater.FAA_AC_LIST_URL)

    assert caught.value is errors[-1]
    assert session.get.call_count == 4
    assert sleeps == [2, 4, 8]


def test_category_uses_120_series_default_and_specific_overrides():
    assert updater.category_for("120-42B") == "Air Carrier Operations"
    assert updater.category_for("120-117") == "Drug and Alcohol Testing"
    assert updater.category_for("120-126A") == "Drug and Alcohol Testing"


def write_sources(
    directory: Path,
    *,
    csv_number: str = "20-1",
    list_number: str = "20-1",
    title: str = "Aircraft Guidance",
    summary: str = "Official guidance.",
) -> tuple[Path, Path]:
    csv_path = directory / "current.csv"
    csv_path.write_text(
        "CHANGENUMBER,DATE,DOCUMENTNUMBER,OFFICE,TITLE\n"
        f'0,2026-01-30T06:00:00Z,{csv_number},AIR-600,"{title}"\n',
        encoding="utf-8",
    )
    list_path = directory / "current.html"
    list_path.write_text(
        f"""
        <table class="searchResults">
          <tbody>
            <tr>
              <td>{list_number}</td>
              <td>
                <a href="/document.information/documentID/1">{title}</a>
                <span class="lineClamp">{summary}</span>
              </td>
              <td>Active</td>
              <td>AIR-600</td>
              <td>2026-01-30</td>
            </tr>
          </tbody>
        </table>
        """,
        encoding="utf-8",
    )
    return csv_path, list_path


def run_update(
    csv_path: Path,
    list_path: Path,
    changed_ids_path: Path | None = None,
    *,
    audit_pdf_content: bool = False,
    skip_pdf_fetch: bool = True,
) -> int:
    args = [
        "--strict",
        "--csv-file",
        str(csv_path),
        "--list-file",
        str(list_path),
    ]
    if skip_pdf_fetch:
        args.append("--skip-pdf-fetch")
    if audit_pdf_content:
        args.append("--audit-pdf-content")
    if changed_ids_path:
        args.extend(["--changed-ids-file", str(changed_ids_path)])
    return updater.main(args)


def use_temporary_index(monkeypatch, directory: Path) -> Path:
    data_path = directory / "data" / "advisory-circulars" / "index.json"
    monkeypatch.setattr(updater, "ROOT_DIR", directory)
    monkeypatch.setattr(updater, "DATA_PATH", data_path)
    return data_path


@pytest.mark.parametrize(
    "summary, expected",
    [
        (
            "Compliance with &sect;&sect; 2 3.2525, 25.1353.",
            "Compliance with §§ 23.2525, 25.1353.",
        ),
        ("See &sect; 2 3.2525(a).", "See § 23.2525(a)."),
        ("See §§ 23.2525, 25.1353.", "See §§ 23.2525, 25.1353."),
        ("Measurements: 2 3.2525.", "Measurements: 2 3.2525."),
        ("See §§ 2 3.25250.", "See §§ 2 3.25250."),
        ("See §§ 2 3.2525A.", "See §§ 2 3.2525A."),
    ],
)
def test_catalog_summary_repairs_confirmed_split_cfr_citation(
    tmp_path, monkeypatch, summary, expected
):
    data_path = use_temporary_index(monkeypatch, tmp_path)
    csv_path, list_path = write_sources(
        tmp_path,
        csv_number="20-184A",
        list_number="20-184A",
        summary=summary,
    )

    assert run_update(csv_path, list_path) == 0

    item = json.loads(data_path.read_text(encoding="utf-8"))["items"][0]
    assert item["summary"] == expected


def test_strict_source_mismatch_stops_before_build_or_write(tmp_path, monkeypatch, capsys):
    data_path = use_temporary_index(monkeypatch, tmp_path)
    csv_path, list_path = write_sources(tmp_path, csv_number="20-1", list_number="20-2")
    changed_ids_path = tmp_path / "changed-ids.txt"
    changed_ids_path.write_text("existing output\n", encoding="utf-8")
    calls: list[str] = []
    monkeypatch.setattr(updater, "build_items", lambda *_args: calls.append("build") or [])
    monkeypatch.setattr(
        updater,
        "write_index",
        lambda *_args: calls.append("write"),
    )

    assert run_update(csv_path, list_path, changed_ids_path) == 1

    assert calls == []
    assert not data_path.exists()
    assert changed_ids_path.read_text(encoding="utf-8") == "existing output\n"
    assert (
        "Error: FAA source mismatch: export-only [20-1]; list-only [20-2]"
        in capsys.readouterr().err
    )
    assert updater.strict_source_error({}, {}) == "FAA source mismatch: export empty; list empty"


def test_exhausted_catalog_fetch_preserves_index_and_changed_ids(tmp_path, monkeypatch):
    data_path = use_temporary_index(monkeypatch, tmp_path)
    csv_path, _list_path = write_sources(tmp_path)
    data_path.parent.mkdir(parents=True)
    original = '{"items": []}\n'
    data_path.write_text(original, encoding="utf-8")
    changed_ids_path = tmp_path / "changed-ids.txt"
    changed_ids_path.write_text("existing output\n", encoding="utf-8")
    session = Mock(spec=updater.requests.Session)
    session.get.side_effect = updater.requests.ReadTimeout("FAA list unavailable")
    monkeypatch.setattr(updater.requests, "Session", lambda: session)
    monkeypatch.setattr(updater.time, "sleep", lambda _delay: None)

    with pytest.raises(updater.requests.ReadTimeout, match="FAA list unavailable"):
        updater.main(
            [
                "--strict",
                "--skip-pdf-fetch",
                "--csv-file",
                str(csv_path),
                "--changed-ids-file",
                str(changed_ids_path),
                "--catalog-attempts",
                "2",
                "--catalog-timeout",
                "90",
            ]
        )

    assert session.get.call_count == 2
    session.get.assert_called_with(updater.FAA_AC_LIST_URL, headers=updater.HEADERS, timeout=(15, 90))
    assert data_path.read_text(encoding="utf-8") == original
    assert changed_ids_path.read_text(encoding="utf-8") == "existing output\n"


@pytest.mark.parametrize("source", ["csv", "list"])
def test_strict_rejects_malformed_catalog_without_writing(tmp_path, monkeypatch, source):
    data_path = use_temporary_index(monkeypatch, tmp_path)
    csv_path, list_path = write_sources(tmp_path)
    path = csv_path if source == "csv" else list_path
    path.write_text("<html>Temporarily unavailable</html>", encoding="utf-8")
    changed_ids_path = tmp_path / "changed-ids.txt"

    assert run_update(csv_path, list_path, changed_ids_path) == 1

    assert not data_path.exists()
    assert not changed_ids_path.exists()


def test_changed_ids_file_includes_changed_and_new_but_not_removed_or_unchanged(tmp_path):
    existing_index = {
        "items": [
            {"id": "unchanged", "number": "20-1", "title": "Same"},
            {"id": "changed", "number": "20-2", "title": "Old"},
            {"id": "removed", "number": "20-3", "title": "Removed"},
        ]
    }
    items = [
        {"id": "unchanged", "number": "20-1", "title": "Same"},
        {"id": "changed", "number": "20-2", "title": "New"},
        {"id": "added", "number": "20-4", "title": "Added"},
    ]
    output_path = tmp_path / "nested" / "changed-ids.txt"

    updater.write_changed_ids_file(str(output_path), items, existing_index)

    assert output_path.read_text(encoding="utf-8") == "changed\nadded\n"

    updater.write_changed_ids_file(str(output_path), existing_index["items"], existing_index)
    assert output_path.read_text(encoding="utf-8") == ""


def test_unchanged_items_preserve_date_and_index_bytes(tmp_path, monkeypatch):
    data_path = use_temporary_index(monkeypatch, tmp_path)
    csv_path, list_path = write_sources(tmp_path)
    monkeypatch.setattr(updater, "current_date", lambda: "2026-01-31")

    assert run_update(csv_path, list_path) == 0
    index = json.loads(data_path.read_text(encoding="utf-8"))
    index["items"][0].update(
        {
            "contentStatus": "complete",
            "contentPath": "content/ac-20-1.json",
            "pageCount": 12,
            "extractedPageCount": 12,
            "wordCount": 3456,
            "contentUpdated": "2026-01-31",
            "replaces": "AC 20-1A",
        }
    )
    data_path.write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    original = data_path.read_bytes()

    monkeypatch.setattr(updater, "current_date", lambda: "2026-02-01")
    assert run_update(csv_path, list_path) == 0

    assert data_path.read_bytes() == original
    assert json.loads(original)["updated"] == "2026-01-31"


def test_meaningful_item_change_updates_date(tmp_path, monkeypatch):
    data_path = use_temporary_index(monkeypatch, tmp_path)
    csv_path, list_path = write_sources(tmp_path)
    monkeypatch.setattr(updater, "current_date", lambda: "2026-01-31")
    assert run_update(csv_path, list_path) == 0

    csv_path, list_path = write_sources(tmp_path, title="Revised Aircraft Guidance")
    monkeypatch.setattr(updater, "current_date", lambda: "2026-02-01")
    assert run_update(csv_path, list_path) == 0

    index = json.loads(data_path.read_text(encoding="utf-8"))
    assert index["updated"] == "2026-02-01"
    assert index["items"][0]["title"] == "Revised Aircraft Guidance"


def test_pdf_url_audit_detects_replaced_pdf(tmp_path, monkeypatch):
    data_path = use_temporary_index(monkeypatch, tmp_path)
    csv_path, list_path = write_sources(tmp_path)
    monkeypatch.setattr(updater, "current_date", lambda: "2026-01-31")
    assert run_update(csv_path, list_path) == 0

    index = json.loads(data_path.read_text(encoding="utf-8"))
    item_id = index["items"][0]["id"]
    index["items"][0].update(
        {
            "pdfUrl": "https://www.faa.gov/documentLibrary/old.pdf",
            "contentStatus": "parsed",
            "contentPath": f"content/{item_id}.json",
        }
    )
    data_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    changed_ids_path = tmp_path / "changed-ids.txt"
    monkeypatch.setattr(
        updater,
        "fetch_pdf_urls",
        lambda *_args: {"20-1": "https://www.faa.gov/documentLibrary/current.pdf"},
    )

    assert (
        run_update(
            csv_path,
            list_path,
            changed_ids_path,
            skip_pdf_fetch=False,
        )
        == 0
    )

    refreshed = json.loads(data_path.read_text(encoding="utf-8"))["items"][0]
    assert refreshed["pdfUrl"] == "https://www.faa.gov/documentLibrary/current.pdf"
    assert "contentPath" not in refreshed
    assert changed_ids_path.read_text(encoding="utf-8") == f"{item_id}\n"


def test_pdf_lookup_failure_retains_stale_url_but_successful_no_pdf_clears_it(
    tmp_path,
    monkeypatch,
):
    data_path = use_temporary_index(monkeypatch, tmp_path)
    csv_path, list_path = write_sources(tmp_path)
    assert run_update(csv_path, list_path) == 0

    index = json.loads(data_path.read_text(encoding="utf-8"))
    item_id = index["items"][0]["id"]
    index["items"][0].update(
        {
            "pdfUrl": "https://www.faa.gov/documentLibrary/stale.pdf",
            "contentStatus": "parsed",
            "contentPath": f"content/{item_id}.json",
        }
    )
    data_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")

    monkeypatch.setattr(updater, "fetch_pdf_urls", lambda *_args: {})
    assert run_update(csv_path, list_path, skip_pdf_fetch=False) == 0
    retained = json.loads(data_path.read_text(encoding="utf-8"))["items"][0]
    assert retained["pdfUrl"].endswith("/stale.pdf")
    assert retained["contentPath"] == f"content/{item_id}.json"

    monkeypatch.setattr(updater, "fetch_pdf_urls", lambda *_args: {"20-1": None})
    assert run_update(csv_path, list_path, skip_pdf_fetch=False) == 0
    cleared = json.loads(data_path.read_text(encoding="utf-8"))["items"][0]
    assert "pdfUrl" not in cleared
    assert "contentPath" not in cleared


def test_pdf_document_fetch_distinguishes_successful_no_pdf_from_failure(monkeypatch):
    class NoPdfResponse:
        text = "<html><body>No PDF published</body></html>"

        def raise_for_status(self):
            return None

    monkeypatch.setattr(updater.requests, "get", lambda *_args, **_kwargs: NoPdfResponse())
    assert updater.fetch_pdf_url("https://www.faa.gov/document/1", attempts=1) == (True, None)

    def failed_request(*_args, **_kwargs):
        raise updater.requests.ConnectionError("unavailable")

    monkeypatch.setattr(updater.requests, "get", failed_request)
    assert updater.fetch_pdf_url("https://www.faa.gov/document/1", attempts=1) == (False, None)


def test_pdf_content_audit_rotates_through_bounded_monthly_shards():
    candidates = {
        f"ac-{index:03}": (f"https://www.faa.gov/{index}.pdf", f"digest-{index}")
        for index in range(205)
    }
    covered: set[str] = set()

    for month in range(1, 4):
        selected, _shard_index, shard_count = updater.select_pdf_audit_candidates(
            candidates,
            100,
            f"2026-{month:02}-01",
        )
        assert len(selected) <= 100
        assert shard_count == 3
        covered.update(selected)

    assert covered == set(candidates)


def test_pdf_content_audit_flags_same_url_byte_change(tmp_path, monkeypatch):
    data_path = use_temporary_index(monkeypatch, tmp_path)
    csv_path, list_path = write_sources(tmp_path)
    monkeypatch.setattr(updater, "current_date", lambda: "2026-01-31")
    assert run_update(csv_path, list_path) == 0

    index = json.loads(data_path.read_text(encoding="utf-8"))
    item = index["items"][0]
    item_id = item["id"]
    pdf_url = "https://www.faa.gov/documentLibrary/current.pdf"
    content_path = f"content/{item_id}.json"
    item.update(
        {
            "pdfUrl": pdf_url,
            "contentStatus": "parsed",
            "contentPath": content_path,
            "contentUpdated": "2026-01-31",
        }
    )
    data_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    content_file = data_path.parent / content_path
    content_file.parent.mkdir(parents=True)
    content_file.write_text(json.dumps({"sha256": "old-digest"}), encoding="utf-8")
    changed_ids_path = tmp_path / "changed-ids.txt"
    monkeypatch.setattr(updater, "fetch_pdf_urls", lambda *_args: {"20-1": pdf_url})

    def changed_pdf_sha256(url, timeout, max_pdf_mib):
        assert url == pdf_url
        assert timeout == 120
        assert max_pdf_mib == 150
        return True, "new-digest"

    monkeypatch.setattr(updater, "fetch_pdf_sha256", changed_pdf_sha256)
    monkeypatch.setattr(updater, "current_date", lambda: "2026-02-01")

    assert (
        run_update(
            csv_path,
            list_path,
            changed_ids_path,
            audit_pdf_content=True,
            skip_pdf_fetch=False,
        )
        == 0
    )

    refreshed_index = json.loads(data_path.read_text(encoding="utf-8"))
    refreshed = refreshed_index["items"][0]
    assert refreshed_index["updated"] == "2026-02-01"
    assert refreshed["pdfUrl"] == pdf_url
    assert refreshed["contentUpdated"] == "2026-01-31"
    assert changed_ids_path.read_text(encoding="utf-8") == f"{item_id}\n"
