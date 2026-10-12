#!/usr/bin/env python3
"""
Fix AIM content formatting issues:
- Remove mid-sentence line breaks
- Fix * markers that should be bold or italic
- Clean up spacing
"""

import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data" / "aim"


def fix_content(content: str) -> str:
    """Fix formatting issues in content."""
    if not content:
        return content

    # Keep * markers for bold/italic - they will be rendered by the UI
    # No change needed for these

    # Handle hyphenated words split across lines: "self-\ncontained" -> "self-contained"
    content = re.sub(r"-\s*\n+\s*", "-", content)

    # Handle space-hyphen patterns: "earth -centered" -> "earth-centered"
    content = re.sub(r"(\w)\s+-\s*(\w)", r"\1-\2", content)

    # Figure lists render from structured metadata in the app.
    content = re.sub(
        r"\n*\*{0,2}(?:Additional\s+)?Figures and Diagrams\*{0,2}\s*$",
        "",
        content,
        flags=re.IGNORECASE,
    )

    # Join lines that are clearly mid-sentence
    # This is a more aggressive approach - join all lines except clear paragraph breaks

    def smart_join_lines(text):
        # Split into paragraphs (separated by double newline or more)
        paragraphs = re.split(r"\n\s*\n", text)

        result_paragraphs = []
        for para in paragraphs:
            if not para.strip():
                continue

            # Within a paragraph, join lines that are mid-sentence
            lines = para.split("\n")
            joined_lines = []
            current_line = ""

            for line in lines:
                line = line.strip()
                if not line:
                    continue

                if not current_line:
                    current_line = line
                else:
                    # Check if this line is a numbered item like "(a)" or "1."
                    is_list_item = bool(re.match(r"^[\(\[]?[a-zA-Z0-9][\)\].]", line))

                    # Check if previous line ends mid-sentence
                    ends_mid = bool(re.search(r"[a-z,;:\-]$", current_line))

                    if is_list_item and not ends_mid:
                        # This is a new list item, keep separate
                        joined_lines.append(current_line)
                        current_line = line
                    elif ends_mid or line[0].islower():
                        # Continuation of sentence
                        current_line = current_line + " " + line
                    else:
                        # New sentence or paragraph
                        joined_lines.append(current_line)
                        current_line = line

            if current_line:
                joined_lines.append(current_line)

            # Join lines within paragraph with single space,
            # but keep list items on separate lines
            result_paragraphs.append("\n".join(joined_lines))

        return "\n\n".join(result_paragraphs)

    content = smart_join_lines(content)

    # Clean up excessive whitespace
    content = re.sub(r"\n{3,}", "\n\n", content)
    content = re.sub(r" {2,}", " ", content)

    # Fix paragraph markers with spaces: ( 1 ) -> (1)
    content = re.sub(r"\(\s*([a-zA-Z0-9]+)\s*\)", r"(\1)", content)

    return content.strip()


def fix_aim_chapter(chapter_file: Path) -> int:
    """Fix content in a chapter file. Returns number of sections fixed."""
    with open(chapter_file, "r", encoding="utf-8") as f:
        chapter = json.load(f)

    fixed_count = 0

    # Fix sections
    for section in chapter.get("sections", []):
        old_content = section.get("content", "")
        if old_content:
            new_content = fix_content(old_content)
            if new_content != old_content:
                section["content"] = new_content
                fixed_count += 1

        # Fix subsections
        for subsection in section.get("subsections", []):
            old_content = subsection.get("content", "")
            if old_content:
                new_content = fix_content(old_content)
                if new_content != old_content:
                    subsection["content"] = new_content
                    fixed_count += 1

    # Save if anything changed
    if fixed_count > 0:
        with open(chapter_file, "w", encoding="utf-8") as f:
            json.dump(chapter, f, indent=2, ensure_ascii=False)

    return fixed_count


def main():
    print("Fixing AIM content formatting...")

    total_fixed = 0

    for chapter_file in sorted(DATA_DIR.glob("chapter*.json")):
        chapter_num = chapter_file.stem.replace("chapter", "")
        fixed = fix_aim_chapter(chapter_file)
        if fixed > 0:
            print(f"  Chapter {chapter_num}: fixed {fixed} sections")
        total_fixed += fixed

    print(f"\nTotal sections fixed: {total_fixed}")


if __name__ == "__main__":
    main()
