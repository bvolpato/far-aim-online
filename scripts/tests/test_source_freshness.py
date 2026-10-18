import sys
from pathlib import Path

import pytest
import requests

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from check_source_freshness import (  # noqa: E402
    check_advisory_circulars,
    check_faa_effective_source,
    compare_source,
    extract_effective_date,
    extract_latest_ac_export_date,
    parse_date,
)


def test_parse_date_supports_official_faa_short_dates():
    assert parse_date("1/22/26").isoformat() == "2026-01-22"
    assert parse_date("2026-06-07").isoformat() == "2026-06-07"
    assert parse_date("June 7, 2026").isoformat() == "2026-06-07"


def test_extract_effective_date_from_faa_summary_html():
    html = """
    <aside>
      <p><strong>Effective:</strong> 7/9/2026</p>
      <p>Change: 2</p>
    </aside>
    """

    assert extract_effective_date(html) == "2026-07-09"


def test_extract_latest_ac_export_date_counts_current_records():
    csv_text = """"CHANGENUMBER","DATE","DOCUMENTNUMBER","OFFICE","TITLE"
"0","2026-01-30T06:00:00Z","21-12D","AIR-632","Application for U.S. Airworthiness Certificate"
"1","2023-11-01T06:00:00Z","20-109B","AFS-300","Service Difficulty Reporting System"
"""

    latest, count = extract_latest_ac_export_date(csv_text)

    assert latest == "2026-01-30"
    assert count == 2


def test_ac_export_403_reports_unknown_instead_of_crashing(monkeypatch):
    def blocked_fetch_text(_session, _url):
        response = requests.Response()
        response.status_code = 403
        raise requests.HTTPError("403 Client Error", response=response)

    monkeypatch.setattr("check_source_freshness.fetch_text", blocked_fetch_text)
    source_status = {
        "sources": [
            {
                "id": "ac",
                "label": "FAA Advisory Circulars",
                "lastUpdated": "2026-06-07",
            }
        ]
    }

    check = check_advisory_circulars(source_status, requests.Session())

    assert check.status == "unknown"
    assert "403" in check.detail


def test_ac_count_mismatch_marks_same_date_catalog_stale(monkeypatch):
    csv_text = """"CHANGENUMBER","DATE","DOCUMENTNUMBER","OFFICE","TITLE"
"0","2026-01-30T06:00:00Z","21-12D","AIR-632","Airworthiness"
"""
    monkeypatch.setattr("check_source_freshness.fetch_text", lambda _session, _url: csv_text)
    source_status = {
        "sources": [
            {
                "id": "ac",
                "label": "FAA Advisory Circulars",
                "lastUpdated": "2026-01-30",
                "itemCount": 2,
            }
        ]
    }

    check = check_advisory_circulars(source_status, requests.Session())

    assert check.status == "stale"
    assert "1 active records" in check.detail
    assert "declares 2" in check.detail


def test_faa_effective_source_403_reports_unknown(monkeypatch):
    def blocked_fetch_text(_session, _url):
        response = requests.Response()
        response.status_code = 403
        raise requests.HTTPError("403 Client Error", response=response)

    monkeypatch.setattr("check_source_freshness.fetch_text", blocked_fetch_text)
    source_status = {
        "sources": [
            {
                "id": "aim",
                "label": "Aeronautical Information Manual",
                "lastUpdated": "2026-03-03",
            }
        ]
    }

    check = check_faa_effective_source(
        source_status,
        "aim",
        "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/",
        "FAA AIM publication effective date.",
        requests.Session(),
    )

    assert check.status == "unknown"
    assert "403" in check.detail


def test_compare_source_marks_newer_official_date_stale():
    source = {
        "id": "aim",
        "label": "Aeronautical Information Manual",
        "lastUpdated": "2026-01-21",
    }

    check = compare_source(source, "2026-01-22", "FAA AIM publication effective date.")

    assert check.status == "stale"
    assert check.remote_date == "2026-01-22"


def test_compare_source_marks_current_when_bundle_date_catches_up():
    source = {
        "id": "far",
        "label": "Federal Aviation Regulations",
        "lastUpdated": "2026-06-07",
    }

    check = compare_source(source, "2025-12-19", "Latest eCFR Title 14 content version date.")

    assert check.status == "current"


@pytest.mark.parametrize("status, expected", [("current", 0), ("stale", 1), ("unknown", 1)])
def test_cli_requires_confirmed_current_sources(monkeypatch, capsys, status, expected):
    import check_source_freshness

    check = check_source_freshness.SourceCheck(
        id="aim",
        label="AIM",
        local_date="2026-07-09",
        remote_date=None,
        status=status,
        detail="Official source could not be verified.",
    )
    monkeypatch.setattr(check_source_freshness, "run_checks", lambda **_kwargs: [check])

    assert check_source_freshness.main(["--json"]) == expected
    assert f'"status": "{status}"' in capsys.readouterr().out


def far_snapshot(tmp_path, monkeypatch, *, snapshot="2026-10-15", title49_snapshot=None):
    import json

    import check_source_freshness

    monkeypatch.setattr(check_source_freshness, "DATA_DIR", tmp_path)
    directory = tmp_path / "far"
    directory.mkdir()
    entries = []
    for title, parts in ((14, [91]), (49, [172, 175, 830, 1544, 1552])):
        for part in parts:
            filename = f"far/part{part}.json"
            entry = {"part": part, "file": filename, "cfr": f"{title} CFR Part {part}"}
            entries.append(entry)
            (tmp_path / filename).write_text(
                json.dumps(
                    {
                        **entry,
                        "effectiveDate": (
                            (title49_snapshot or snapshot) if title == 49 else snapshot
                        ),
                    }
                ),
                encoding="utf-8",
            )
    (directory / "index.json").write_text(json.dumps({"parts": entries}), encoding="utf-8")
    return {
        "sources": [
            {"id": "far", "label": "Federal Aviation Regulations", "lastUpdated": "2026-10-17"}
        ]
    }


def test_far_freshness_uses_snapshot_not_crawl_date_and_complete_metadata(tmp_path, monkeypatch):
    from check_source_freshness import check_far

    source_status = far_snapshot(tmp_path, monkeypatch, snapshot="2026-07-24")
    monkeypatch.setattr(
        "check_source_freshness.fetch_json",
        lambda _session, _url: {
            "content_versions": [{"date": "2026-07-24", "issue_date": "2026-07-24"}],
            "meta": {"latest_issue_date": "2026-10-15", "total_pages": "16"},
        },
    )

    check = check_far(source_status, requests.Session())

    assert check.status == "stale"
    assert check.local_date == "2026-07-24"
    assert check.remote_date == "2026-10-15"


def test_far_freshness_includes_supported_title49_changes_only(tmp_path, monkeypatch):
    from check_source_freshness import check_far

    source_status = far_snapshot(tmp_path, monkeypatch, title49_snapshot="2026-07-24")
    urls = []

    def latest(_session, url):
        urls.append(url)
        return {
            "content_versions": [{"date": "2026-07-24", "issue_date": "2026-07-24"}],
            "meta": {"latest_issue_date": "2026-10-13" if "part=175" in url else "2026-07-24"},
        }

    monkeypatch.setattr("check_source_freshness.fetch_json", latest)

    check = check_far(source_status, requests.Session())

    assert check.status == "stale"
    assert "49 CFR Part 175" in check.detail
    assert {url.split("?part=")[-1] for url in urls if "title-49" in url} == {
        "172",
        "175",
        "830",
        "1544",
        "1552",
    }


def test_far_freshness_is_current_when_scoped_changes_are_older(tmp_path, monkeypatch):
    from check_source_freshness import check_far

    source_status = far_snapshot(tmp_path, monkeypatch, title49_snapshot="2026-07-24")

    def latest(_session, url):
        assert "title-49.json" not in url or "?part=" in url
        return {"meta": {"latest_issue_date": "2026-10-15" if "title-14" in url else "2026-07-24"}}

    monkeypatch.setattr("check_source_freshness.fetch_json", latest)

    assert check_far(source_status, requests.Session()).status == "current"
