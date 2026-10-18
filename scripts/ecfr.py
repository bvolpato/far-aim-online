"""Shared eCFR version metadata handling for crawling and freshness checks."""

from datetime import date
from typing import Any

ECFR_VERSIONS_URL = "https://www.ecfr.gov/api/versioner/v1/versions/title-{title}.json"
TITLE_49_PARTS = (172, 175, 830, 1544, 1552)


def latest_ecfr_issue_date(data: dict[str, Any]) -> str:
    """Read the complete result's publication date, even when versions are paginated."""
    # content_versions is capped at 1,000 records by default. Its metadata describes
    # the full result and includes editorial corrections as well as amendments.
    value = data.get("meta", {}).get("latest_issue_date")
    if not isinstance(value, str):
        raise ValueError("eCFR response is missing meta.latest_issue_date")
    published = date.fromisoformat(value)
    if published > date.today():
        raise ValueError(f"eCFR issue date is in the future: {value}")
    return published.isoformat()
