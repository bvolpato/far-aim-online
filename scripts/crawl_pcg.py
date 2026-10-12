#!/usr/bin/env python3
"""Crawl Pilot/Controller Glossary from official FAA HTML."""

import json
import re
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from clean_data import clean_text

PCG_BASE_URL = "https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/"
PCG_INDEX_URL = f"{PCG_BASE_URL}index.html"

# Output directory
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data" / "aim"

SEE_REFERENCE_PATTERN = re.compile(
    r"\((See(?:\s+also)?)(?:\s+ICAO\s+term)?\s+((?:[^()]|\([^()]*\))+?)\.?\)",
    re.IGNORECASE,
)
REFER_REFERENCE_PATTERN = re.compile(r"\(Refer to [^)]+\)", re.IGNORECASE)
SEE_REFERENCE_ALIASES = {
    "AUTOMATIC FLIGHT INFORMATION SERVICE ALASKA FSSS ONLY": "AUTOMATIC FLIGHT INFORMATION SERVICE",
    "CONSOLIDATED WAKE TURBULENCE": "WAKE TURBULENCE",
    "DEPARTURE CLEARANCE APPLICATION": "DEPARTURE CLEARANCE",
    "OCEANIC NAVIGATIONAL ERROR REPORT": "OCEANIC ERROR REPORT",
}
PCG_DASHES = "-‐‑‒–—"
PCG_DASH_PATTERN = re.compile(f"[{re.escape(PCG_DASHES)}]")


def fetch_text(url: str) -> str | None:
    try:
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        print(f"Error fetching {url}: {e}")
        return None


def extract_effective_date(html: str) -> str:
    text = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
    match = re.search(r"Effective:\s*(\d{1,2})/(\d{1,2})/(\d{2,4})", text, re.IGNORECASE)
    if not match:
        raise ValueError("FAA PCG effective date not found")

    month, day, year = match.groups()
    if len(year) == 2:
        year = f"20{year}"
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def parse_pcg_index(html: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    pages = {
        link.get("href", "")
        for link in soup.select('a[href^="glossary-"]')
        if re.fullmatch(r"glossary-[a-w]\.html", link.get("href", ""), re.IGNORECASE)
    }
    return sorted(pages)


def _has_balanced_term_delimiters(text: str) -> bool:
    expected_closers = {"(": ")", "[": "]"}
    stack = []
    for char in text:
        if char in expected_closers:
            stack.append(expected_closers[char])
        elif char in ")]":
            if not stack or stack.pop() != char:
                return False
    return not stack


def _split_visible_term_entry(full_text: str, raw_term: str) -> tuple[str, str] | None:
    """Split an official entry after malformed dfn markup hid part of its term."""
    raw_prefix = re.sub(rf"[{re.escape(PCG_DASHES)}]\s*$", "", raw_term).strip()
    if not raw_prefix:
        return None

    raw_start = full_text.find(raw_prefix)
    if raw_start < 0:
        return None

    for match in PCG_DASH_PATTERN.finditer(full_text, raw_start + len(raw_prefix)):
        candidate = full_text[: match.start()].strip()
        definition = full_text[match.end() :].strip()
        if not candidate.startswith(raw_prefix) or not _has_balanced_term_delimiters(candidate):
            continue
        if (
            definition
            and not full_text[match.end() : match.end() + 1].isspace()
            and not candidate.endswith((")", "]"))
        ):
            continue
        return candidate, definition

    return None


def parse_official_pcg_page(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    article = soup.select_one("article.pcg-content")
    if article is None:
        return []

    terms: list[dict] = []
    current_term: str | None = None
    current_definition: list[str] = []

    def finish_term() -> None:
        nonlocal current_term, current_definition
        if current_term:
            terms.append(
                {
                    "term": clean_pcg_value(current_term, is_title=True),
                    "definition": clean_pcg_value(" ".join(current_definition).strip()),
                }
            )
        current_term = None
        current_definition = []

    for node in article.find_all(["p", "ol", "aside"]):
        if node.find_parent(["ol", "aside"], class_=["glossary-sub-list", "glossary-note"]):
            continue
        classes = set(node.get("class", []))
        if node.name == "p" and "glossary-term-entry" in classes:
            full_text = node.get_text(" ", strip=True)
            term_node = node.select_one("dfn.term-name")
            if term_node:
                raw_term = term_node.get_text(" ", strip=True)
                raw_prefix = re.sub(rf"[{re.escape(PCG_DASHES)}]\s*$", "", raw_term).strip()
                raw_start = full_text.find(raw_prefix)
                if raw_prefix and raw_start >= 0:
                    tail_start = raw_start + len(raw_prefix) - 1
                    tail = re.sub(
                        rf"(?<=[A-Za-z0-9)])\s+([{re.escape(PCG_DASHES)}])(?=[A-Za-z0-9(\[])",
                        r"\1",
                        full_text[tail_start:],
                        count=1,
                    )
                    full_text = full_text[:tail_start] + tail
                term = re.sub(r"\s*[-‐‑‒–—]\s*$", "", raw_term).strip()
                definition = full_text[len(raw_term) :].lstrip(" -‐‑‒–—")
                visible_split = _split_visible_term_entry(full_text, raw_term)
                if visible_split:
                    visible_term, visible_definition = visible_split
                    if len(visible_term) > len(term) and visible_term.startswith(term):
                        term, definition = visible_term, visible_definition
            else:
                trailing = re.match(r"(.+)[-‐‑‒–—]\s*$", full_text)
                separated = re.match(r"(.+)[-‐‑‒–—]\s+(\S.*)$", full_text)
                inline = re.match(r"([^-‐‑‒–—]+)[-‐‑‒–—](\S.*)$", full_text)
                if trailing:
                    term, definition = trailing.group(1), ""
                elif separated:
                    term, definition = separated.groups()
                elif inline:
                    term, definition = inline.groups()
                elif len(full_text) < 80 and not full_text.endswith(":"):
                    term, definition = full_text, ""
                else:
                    if current_term:
                        current_definition.append(full_text)
                    continue

            finish_term()
            current_term = term
            if definition:
                current_definition.append(definition)
            continue

        if current_term is None:
            continue

        if "glossary-cross-reference" in classes:
            label_node = node.select_one(".cross-ref-label")
            target_node = (
                node.select_one(".cross-ref-term")
                or node.select_one(".cross-ref-target")
                or node.select_one("a[data-term]")
                or node.select_one("a.external-ref-link")
            )
            if label_node and target_node:
                label = re.sub(r"[^A-Za-z ]", "", label_node.get_text(" ", strip=True)).strip()
                target = target_node.get_text(" ", strip=True)
                target = re.sub(r"\s*\(opens in new tab\).*|\s*↗$", "", target).strip()
                if not target:
                    target = str(target_node.get("data-term", "")).strip()
                current_definition.append(f"({label} {target}.)")
            continue

        text = node.get_text(" ", strip=True)
        if text:
            current_definition.append(text)

    finish_term()
    return terms


def merge_duplicate_terms(terms: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for term in terms:
        existing = merged.get(term["term"])
        if existing is None:
            merged[term["term"]] = term
            continue
        definition = term["definition"]
        if definition and definition not in existing["definition"]:
            existing["definition"] = "\n\n".join(
                value for value in (existing["definition"], definition) if value
            )
    return list(merged.values())


def fix_broken_words(text: str) -> str:
    """
    Fix words that have been broken by PDF extraction with spaces.
    E.g., "ELEV ATION" -> "ELEVATION", "RESERV ATION" -> "RESERVATION"
    """
    # Common broken word patterns from FAA documents
    broken_words = {
        "ELEV ATION": "ELEVATION",
        "RESERV ATION": "RESERVATION",
        "NA VIGA TION": "NAVIGATION",
        "NAVIGA TION": "NAVIGATION",
        "ELEVA TION": "ELEVATION",
        "RESERVA TION": "RESERVATION",
        "IDENTIFICA TION": "IDENTIFICATION",
        "COMMUNICA TION": "COMMUNICATION",
        "INFORMA TION": "INFORMATION",
        "OPERA TION": "OPERATION",
        "CONFIGURA TION": "CONFIGURATION",
        "SEPARA TION": "SEPARATION",
        "AUTHORIZA TION": "AUTHORIZATION",
        "COORDINA TION": "COORDINATION",
        "DESTINA TION": "DESTINATION",
        "DIREC TION": "DIRECTION",
        "ELEC TION": "ELECTION",
        "FUNC TION": "FUNCTION",
        "INSTRUC TION": "INSTRUCTION",
        "LOCA TION": "LOCATION",
        "MODIFICA TION": "MODIFICATION",
        "POSI TION": "POSITION",
        "PROTEC TION": "PROTECTION",
        "REGULA TION": "REGULATION",
        "RESTRIC TION": "RESTRICTION",
        "SITUA TION": "SITUATION",
        "TRANSI TION": "TRANSITION",
        "VARIA TION": "VARIATION",
        "humanita rian": "humanitarian",
        "A V AILABLE": "AVAILABLE",
        "V AILABLE": "VAILABLE",
        "AV AILABLE": "AVAILABLE",
    }

    result = text
    for broken, fixed in broken_words.items():
        result = result.replace(broken, fixed)
        # Also handle lowercase
        result = result.replace(broken.lower(), fixed.lower())
        # Handle title case
        result = result.replace(broken.title(), fixed.title())

    return result


def clean_pcg_value(text: str, *, is_title: bool = False) -> str:
    return fix_broken_words(clean_text(text, is_title=is_title))


def is_term_candidate(candidate: str) -> bool:
    if not candidate:
        return False
    if candidate.startswith("(") or candidate.lower().startswith(("see ", "refer ")):
        return False
    without_qualifiers = re.sub(r"\([^)]*\)|\[[^]]*\]", "", candidate)
    if not re.search(r"[a-z]", without_qualifiers):
        return True
    if re.fullmatch(r"[A-Za-z0-9]+", candidate):
        return True
    return candidate.startswith(("DoD ", "ICAO "))


def split_term_line(line: str) -> tuple[str, str] | None:
    for index, char in enumerate(line):
        if char != "-":
            continue

        candidate = line[:index].strip()
        definition = line[index + 1 :].strip()
        if not is_term_candidate(candidate):
            continue
        if (
            re.search(r"[a-z]", candidate)
            and index > 0
            and index + 1 < len(line)
            and line[index - 1].isalnum()
            and line[index + 1].isalnum()
        ):
            continue

        next_hyphen = definition.find("-")
        first_lower = re.search(r"[a-z]", definition)
        if (
            next_hyphen != -1
            and (first_lower is None or next_hyphen < first_lower.start())
            and not definition.startswith("(")
        ):
            continue

        return candidate, definition

    return None


def is_standalone_term_line(line: str, next_line: str) -> bool:
    return (
        len(line) > 1
        and not line.endswith((".", ".)"))
        and is_term_candidate(line)
        and bool(re.match(r"^\((See|Refer)\b", next_line, re.IGNORECASE))
    )


def is_page_chrome(line: str) -> bool:
    return bool(
        re.match(r"^PCG\s+[A-Z]\s*-\s*\d+\b", line)
        or re.search(r"\d+/\d+/\d+\s+Pilot/Controller Glossary", line)
        or re.match(r"^Pilot/Controller Glossary\s+\d+/\d+/\d+", line)
        or re.match(r"^\d+/\d+/\d+\s+AIM$", line)
    )


def normalize_term_key(term: str) -> str:
    normalized = term.upper()
    normalized = re.sub(r"\[ICAO\]", "", normalized)
    normalized = normalized.replace("ICAO TERM", "")
    normalized = re.sub(r"[^A-Z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def find_term(ref: str, terms_by_key: dict[str, dict]) -> dict | None:
    ref_key = normalize_term_key(ref)
    alias = SEE_REFERENCE_ALIASES.get(ref_key)
    if alias:
        return find_term(alias, terms_by_key)

    if ref_key in terms_by_key:
        return terms_by_key[ref_key]

    for key, term in terms_by_key.items():
        if key.startswith(ref_key):
            return term
        if len(key) >= 8 and ref_key.endswith(key):
            return term

    return None


def see_references(definition: str) -> list[str]:
    return [match.group(2).strip() for match in SEE_REFERENCE_PATTERN.finditer(definition)]


def is_only_reference(definition: str) -> bool:
    without_refs = SEE_REFERENCE_PATTERN.sub("", definition)
    without_refs = REFER_REFERENCE_PATTERN.sub("", without_refs)
    without_refs = re.sub(r"[\s.]+", "", without_refs)
    return without_refs == ""


def expand_see_references(terms: list[dict]) -> list[dict]:
    terms_by_key = {normalize_term_key(term["term"]): term for term in terms}

    def resolved_definition(term: dict, stack: tuple[str, ...] = ()) -> str:
        key = normalize_term_key(term["term"])
        definition = term["definition"]

        if key in stack or not is_only_reference(definition):
            return definition

        expanded = []
        for ref in see_references(definition):
            refs = re.split(r"\s+and\s+", ref, flags=re.IGNORECASE)
            for candidate_ref in refs:
                target = find_term(candidate_ref, terms_by_key)
                if not target:
                    continue

                target_definition = resolved_definition(target, stack + (key,))
                expanded.append(f"{target['term']}: {target_definition}")

        expanded.extend(REFER_REFERENCE_PATTERN.findall(definition))

        return "\n\n".join(expanded) if expanded else definition

    return [
        {
            **term,
            "definition": resolved_definition(term),
        }
        for term in terms
    ]


def parse_pcg(text: str) -> list[dict]:
    lines = text.splitlines()
    terms = []
    current_term = None
    current_def = []

    start_parsing = False

    for index, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue

        # Skip header junk until we see the start
        if not start_parsing:
            if line == "A":  # The letter A usually starts the glossary
                start_parsing = True
            continue

        # Skip page numbers like PCG-1
        if re.match(r"^PCG-\d+", line) or is_page_chrome(line):
            continue

        if "AIM INDEX" in line or line == "INDEX":
            break

        # Skip section letter headings
        if re.fullmatch(r"[A-Z]", line):
            continue

        # Check for new term
        match = split_term_line(line)
        next_line = next((value.strip() for value in lines[index + 1 :] if value.strip()), "")
        if match or is_standalone_term_line(line, next_line):
            # Save previous term
            if current_term:
                terms.append(
                    {
                        "term": clean_pcg_value(current_term, is_title=True),
                        "definition": clean_pcg_value(" ".join(current_def).strip()),
                    }
                )

            # Start new term
            current_term = match[0] if match else line
            def_start = match[1] if match else ""
            current_def = [def_start] if def_start else []
        else:
            # Append to current definition
            if current_term:
                current_def.append(line)

    # Add last term
    if current_term:
        terms.append(
            {
                "term": clean_pcg_value(current_term, is_title=True),
                "definition": clean_pcg_value(" ".join(current_def).strip()),
            }
        )

    return expand_see_references(terms)


def main():
    print("PCG Crawler - Downloading Pilot/Controller Glossary")
    print("=" * 60)

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Fetching from {PCG_INDEX_URL}")
    index_html = fetch_text(PCG_INDEX_URL)

    if not index_html:
        sys.exit(1)

    pages = parse_pcg_index(index_html)
    if not pages:
        print("No FAA PCG letter pages found")
        sys.exit(1)

    raw_terms = []
    for page in pages:
        page_html = fetch_text(f"{PCG_BASE_URL}{page}")
        if not page_html:
            sys.exit(1)
        raw_terms.extend(parse_official_pcg_page(page_html))

    terms = expand_see_references(merge_duplicate_terms(raw_terms))
    print(f"Found {len(terms)} terms")

    # Save to JSON
    output_file = DATA_DIR / "pcg.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(
            {
                "title": "Pilot/Controller Glossary",
                "source": PCG_INDEX_URL,
                "lastUpdated": extract_effective_date(index_html),
                "terms": terms,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    print(f"Saved to {output_file}")


if __name__ == "__main__":
    main()
