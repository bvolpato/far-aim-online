#!/usr/bin/env python3
"""
Comprehensive data cleaning script for FAR/AIM data.
Fixes:
1. Encoding issues (broken UTF-8 characters)
2. Redundant "AIM X-X-X:" prefixes in titles
3. Over-merged words (undo "AVORTAC" -> "A VORTAC")
4. Broken words from PDF extraction ("ELEV ATION" -> "ELEVATION")
"""

import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"


MOJIBAKE_SEQUENCE = re.compile(r"[\u00c2\u00c3][\u0080-\u00ff]|[\u00e2\u00ef][\u0080-\u00ff]{2}")


def repair_mojibake(text: str) -> str:
    """Decode common UTF-8 bytes that were read as Latin-1/Windows-1252."""

    def decode_match(match: re.Match[str]) -> str:
        value = match.group(0)
        try:
            return value.encode("latin-1").decode("utf-8")
        except UnicodeError:
            return value

    return MOJIBAKE_SEQUENCE.sub(decode_match, text)


def fix_encoding(text: str) -> str:
    """Fix common encoding issues from PDF/HTML extraction."""
    if not text:
        return text

    result = repair_mojibake(text)

    encoding_fixes = {
        "\u00a0": " ",
        "\u00ad": "",
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2015": "-",
        "\u2212": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\ufb01": "fi",
        "\ufb02": "fl",
        "\u0003": " ",
        "\u0004": "-",
        "\ufffd": "",
    }

    for broken, fixed in encoding_fixes.items():
        result = result.replace(broken, fixed)

    phrase_fixes = {
        "Omni directional": "Omni-directional",
        "Omni -directional": "Omni-directional",
        "Omni-directional": "Omni-directional",
        "ADS B": "ADS-B",
        "ADS -B": "ADS-B",
        "ADS C": "ADS-C",
        "ADS -C": "ADS-C",
        "TIS B": "TIS-B",
        "TIS -B": "TIS-B",
        "FIS B": "FIS-B",
        "FIS -B": "FIS-B",
        "ASDE X": "ASDE-X",
        "ASDE -X": "ASDE-X",
        "K -9": "K-9",
        "VFR -on-top": "VFR-on-top",
        "Surveillance -Broadcast": "Surveillance-Broadcast",
        "Surveillance -Contract": "Surveillance-Contract",
        "SURVEILLANCE -CONTRACT": "SURVEILLANCE-CONTRACT",
        "Service - Broadcast": "Service-Broadcast",
        "Service- Broadcast": "Service-Broadcast",
        "Non -Charted": "Non-Charted",
        "short -range": "short-range",
        "Hold-in-lieu": "Hold-in-lieu",
        "Side-step": "Side-step",
        "Half-way": "Half-way",
    }

    for broken, fixed in phrase_fixes.items():
        result = result.replace(broken, fixed)

    result = re.sub(r"\s+([,:)])", r"\1", result)
    result = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", result)
    result = re.sub(r"[ \t]{2,}", " ", result)
    result = re.sub(r"-{2,}", "-", result)

    return result


def fix_aim_title(title: str) -> str:
    """
    Clean AIM titles:
    1. Remove redundant 'AIM X-X-X:' prefix
    2. Remove titles that are actually content (start with "a.", "b.", "(1)", etc.)
    """
    if not title:
        return title

    # Pattern: "AIM X-X-X:" or "AIM X-X-X." at the start
    result = re.sub(r"^AIM\s+\d+-\d+-\d+[:.]\s*", "", title)

    return result.strip()


def fix_over_merged_words(text: str) -> str:
    """
    Fix words that were incorrectly merged.
    The previous fix merged "A VORTAC" into "AVORTAC" which is wrong.
    """
    if not text:
        return text

    # Words that start with A/a followed by space that should NOT be merged
    # Pattern: standalone "A" or "a" followed by an uppercase word
    # We need to UNDO the merge for specific known cases

    # Known incorrectly merged words to fix
    unmerge_words = {
        "AVORTAC": "A VORTAC",
        "AGBAS": "A GBAS",
        "ATACAN": "A TACAN",
        "ANDB": "A NDB",
        "AVOR": "A VOR",
        "ADME": "A DME",
        "AILS": "A ILS",
        "ALOC": "A LOC",
        "AGPS": "A GPS",
        "ARNAV": "A RNAV",
        "AWAAS": "A WAAS",
    }

    result = text
    for merged, unmerged in unmerge_words.items():
        # Only replace at word boundaries and when it's at the start of a sentence
        # Pattern: after period+space, after newline, or at start
        result = re.sub(rf"(?<=[.!?]\s){merged}\b", unmerged, result)
        result = re.sub(rf"(?<=\n){merged}\b", unmerged, result)
        result = re.sub(rf"^{merged}\b", unmerged, result)

    return result


def fix_broken_words(text: str) -> str:
    """
    Fix words broken by PDF extraction (space in middle of word).
    E.g., "ELEV ATION" -> "ELEVATION"

    Only fix SPECIFIC known broken patterns to avoid over-correction.
    """
    if not text:
        return text

    # Specific broken word patterns that we KNOW are wrong
    # These are caused by column breaks in PDFs
    broken_words = {
        # -TION words (most common PDF break pattern)
        "ELEV ATION": "ELEVATION",
        "RESERV ATION": "RESERVATION",
        "NAVIGA TION": "NAVIGATION",
        "NA VIGA TION": "NAVIGATION",
        "NA VIGATION": "NAVIGATION",
        "MA TERIALS": "MATERIALS",
        "TAXIW AY": "TAXIWAY",
        "WEA THER": "WEATHER",
        "DA TA": "DATA",
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
        "NOTIFICA TION": "NOTIFICATION",
        "AVIA TION": "AVIATION",
        "A VIATION": "AVIATION",
        "A VIA TION": "AVIATION",
        "A VOIDANCE": "AVOIDANCE",
        "APPLICA TION": "APPLICATION",
        "ASSOCIA TION": "ASSOCIATION",
        "CERTIFICA TION": "CERTIFICATION",
        "CLASSIFICA TION": "CLASSIFICATION",
        "CORREC TION": "CORRECTION",
        "DETEC TION": "DETECTION",
        "EVALUA TION": "EVALUATION",
        "INVESTIGA TION": "INVESTIGATION",
        "ORGANIZA TION": "ORGANIZATION",
        "PUBLICA TION": "PUBLICATION",
        "SIMULA TION": "SIMULATION",
        "SPECIFICA TION": "SPECIFICATION",
        "VERIFICA TION": "VERIFICATION",
        # -ABLE words
        "A V AILABLE": "AVAILABLE",
        "AV AILABLE": "AVAILABLE",
        # -ANCED/-ANCE words
        "ADV ANCED": "ADVANCED",
        "ADV ANCE": "ADVANCE",
        "DIST ANCE": "DISTANCE",
        "PERFORM ANCE": "PERFORMANCE",
        "CLEAR ANCE": "CLEARANCE",
        "GUID ANCE": "GUIDANCE",
        "MAINT ENANCE": "MAINTENANCE",
        "ARRIV AL": "ARRIVAL",
        # -ED words
        "ASSIGN ED": "ASSIGNED",
        "DESIGN ED": "DESIGNED",
        "OPERAT ED": "OPERATED",
        # -ATCH words
        "W ATCH": "WATCH",
        "W A TCH": "WATCH",
        "M ATCH": "MATCH",
        "P ATCH": "PATCH",
        # -AGE words
        "MESS AGE": "MESSAGE",
        "PACK AGE": "PACKAGE",
        "STOR AGE": "STORAGE",
        "VOLT AGE": "VOLTAGE",
        # -MENT words
        "EQUIP MENT": "EQUIPMENT",
        "ENVIRON MENT": "ENVIRONMENT",
        "REQUIRE MENT": "REQUIREMENT",
        "MANAGE MENT": "MANAGEMENT",
        "MOVE MENT": "MOVEMENT",
        # -ICAL/-OLOGY words
        "METEOROLOG ICAL": "METEOROLOGICAL",
        "AERONAUT ICAL": "AERONAUTICAL",
        "TECHN ICAL": "TECHNICAL",
        "NAUT ICAL": "NAUTICAL",
        "PRACT ICAL": "PRACTICAL",
        # Other common breaks
        "humanita rian": "humanitarian",
        "Humanita rian": "Humanitarian",
        "AIR MEN": "AIRMEN",
        "AIRMEN'SMETEOROLOGICAL": "AIRMEN'S METEOROLOGICAL",
        "AIR CRAFT": "AIRCRAFT",
        "AIR PORT": "AIRPORT",
        "AIR SPACE": "AIRSPACE",
        "AIR WAY": "AIRWAY",
        "RUN WAY": "RUNWAY",
        "TAX IWAY": "TAXIWAY",
        "HEAD ING": "HEADING",
        "LAND ING": "LANDING",
        "WARN ING": "WARNING",
        "BEAR ING": "BEARING",
        "CLEAR ING": "CLEARING",
        "F AA": "FAA",
        "A TC": "ATC",
        "PR M": "PRM",
        "RNA V": "RNAV",
        "LNA V": "LNAV",
        "NA V AID": "NAVAID",
        "NA V CANADA": "NAV CANADA",
        "V oice": "Voice",
        "P AO": "PAO",
        "te rritories": "territories",
        "interrupt s": "interrupts",
        "day time": "daytime",
        "t hought": "thought",
        "calcula tor": "calculator",
        "a ppropriate": "appropriate",
        "speci fic": "specific",
    }

    result = text
    for broken, fixed in broken_words.items():
        result = result.replace(broken, fixed)
        # Also handle lowercase
        result = result.replace(broken.lower(), fixed.lower())
        # And title case
        result = result.replace(broken.title(), fixed.title())

    return result


def capitalize_after_marker(text: str) -> str:
    """
    Capitalize the first letter after paragraph markers like 'a. ' or '1. '.
    E.g., 'a. a VORTAC' -> 'a. A VORTAC'
    """
    if not text:
        return text

    # Pattern: paragraph marker followed by lowercase letter
    # Matches: a. a, b. the, 1. when, (a) aircraft, etc.
    def capitalize_match(match):
        return match.group(1) + match.group(2).upper()

    result = text
    # After "X. " pattern (letter or number followed by period and space)
    result = re.sub(r"([a-z0-9]\. )([a-z])", capitalize_match, result)
    # After "(X) " pattern
    result = re.sub(r"(\([a-z0-9]+\) )([a-z])", capitalize_match, result)

    return result


def clean_text(text: str, is_title: bool = False) -> str:
    """Apply all cleaning functions to text."""
    if not text:
        return text

    result = text

    # 1. Fix encoding issues first
    result = fix_encoding(result)

    # 2. Fix broken words (from PDF extraction)
    result = fix_broken_words(result)

    # 3. Fix over-merged words (undo incorrect merges)
    result = fix_over_merged_words(result)

    # 4. For titles, remove redundant AIM prefix
    if is_title:
        result = fix_aim_title(result)

    # 5. Clean up whitespace
    result = re.sub(r"\b([A-Za-z]+)\s+\(s\)", r"\1(s)", result)
    result = re.sub(r" {2,}", " ", result)
    result = re.sub(r"\n{3,}", "\n\n", result)

    return result.strip()


def clean_dict_recursively(obj, parent_key: str = ""):
    """Recursively clean all string values in a dict/list."""
    if isinstance(obj, str):
        is_title = parent_key in ("title", "term")
        return clean_text(obj, is_title=is_title)
    elif isinstance(obj, dict):
        return {k: clean_dict_recursively(v, k) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_dict_recursively(item, parent_key) for item in obj]
    else:
        return obj


def clean_json_file(filepath: Path) -> bool:
    """Clean a single JSON file. Returns True if changes were made."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            original = f.read()
            data = json.loads(original)

        cleaned_data = clean_dict_recursively(data)
        cleaned_json = json.dumps(cleaned_data, indent=2, ensure_ascii=False)

        if cleaned_json != json.dumps(data, indent=2, ensure_ascii=False):
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(cleaned_json)
            return True
        return False
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return False


def main():
    print("Comprehensive Data Cleaning for FAR/AIM")
    print("=" * 60)
    print("Fixing: encoding, broken words, over-merged words, redundant titles")
    print()

    files_changed = 0
    files_checked = 0

    # Clean AIM
    aim_dir = DATA_DIR / "aim"
    print("Cleaning AIM data...")
    for json_file in sorted(aim_dir.glob("*.json")):
        files_checked += 1
        if clean_json_file(json_file):
            print(f"  Fixed: {json_file.name}")
            files_changed += 1

    # Clean FAR
    far_dir = DATA_DIR / "far"
    print("\nCleaning FAR data...")
    for json_file in sorted(far_dir.glob("*.json")):
        files_checked += 1
        if clean_json_file(json_file):
            print(f"  Fixed: {json_file.name}")
            files_changed += 1

    # Clean quizzes
    quiz_dir = DATA_DIR / "quizzes"
    print("\nCleaning Quiz data...")
    for json_file in sorted(quiz_dir.glob("*.json")):
        files_checked += 1
        if clean_json_file(json_file):
            print(f"  Fixed: {json_file.name}")
            files_changed += 1

    # Clean flashcards
    flashcard_dir = DATA_DIR / "flashcards"
    print("\nCleaning Flashcard data...")
    for json_file in sorted(flashcard_dir.glob("*.json")):
        files_checked += 1
        if clean_json_file(json_file):
            print(f"  Fixed: {json_file.name}")
            files_changed += 1

    print()
    print("=" * 60)
    print(f"Files checked: {files_checked}")
    print(f"Files changed: {files_changed}")
    print("Done!")


if __name__ == "__main__":
    main()
