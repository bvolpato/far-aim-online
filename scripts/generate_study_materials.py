#!/usr/bin/env python3
"""
Generate study materials (quizzes and flashcards) for each section of the FAR and AIM.
This script embeds the generated content directly into the JSON files.
"""

import json
import random
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"


def generate_quiz_for_section(section_id, title, content):
    """Generates a simple quiz question based on the section."""

    # Create some dummy options
    options = [
        title,
        f"Regulations regarding {section_id}",
        f"General operating rules for {section_id}",
        f"Specific requirements for {section_id}",
    ]

    # Shuffle options but keep track of the correct one
    correct_option = options[0]
    random.shuffle(options)
    correct_index = options.index(correct_option)

    return {
        "question": f"What is the primary subject of section {section_id}?",
        "options": options,
        "correctAnswer": correct_index,
        "explanation": f"Section {section_id} is titled '{title}'. {content[:100]}...",
    }


def generate_flashcard_for_section(section_id, title, content):
    """Generates a flashcard based on the section."""
    return {
        "front": f"{section_id}: {title}",
        "back": content[:200] + ("..." if len(content) > 200 else ""),
    }


def process_far_files():
    far_dir = DATA_DIR / "far"
    print(f"Processing FAR files in {far_dir}...")

    count = 0
    for f in far_dir.glob("part*.json"):
        try:
            with open(f, "r") as file:
                data = json.load(file)

            modified = False

            # Process sections
            if "sections" in data:
                for section in data["sections"]:
                    if "quiz" not in section:
                        section["quiz"] = generate_quiz_for_section(
                            section["section"], section["title"], section.get("content", "")
                        )
                        modified = True

                    if "flashcard" not in section:
                        section["flashcard"] = generate_flashcard_for_section(
                            section["section"], section["title"], section.get("content", "")
                        )
                        modified = True

            # Process subparts
            if "subparts" in data:
                for subpart in data["subparts"]:
                    if "sections" in subpart:
                        for section in subpart["sections"]:
                            if "quiz" not in section:
                                section["quiz"] = generate_quiz_for_section(
                                    section["section"], section["title"], section.get("content", "")
                                )
                                modified = True

                            if "flashcard" not in section:
                                section["flashcard"] = generate_flashcard_for_section(
                                    section["section"], section["title"], section.get("content", "")
                                )
                                modified = True

            if modified:
                with open(f, "w") as file:
                    json.dump(data, file, indent=2)
                count += 1

        except Exception as e:
            print(f"Error processing {f}: {e}")

    print(f"Updated {count} FAR files.")


def process_aim_files():
    aim_dir = DATA_DIR / "aim"
    print(f"Processing AIM files in {aim_dir}...")

    count = 0
    for f in aim_dir.glob("chapter*.json"):
        try:
            with open(f, "r") as file:
                data = json.load(file)

            modified = False

            if "sections" in data:
                for section in data["sections"]:
                    # New format with content directly in section
                    if "content" in section and section["content"]:
                        if "quiz" not in section:
                            section["quiz"] = generate_quiz_for_section(
                                section["section"], section["title"], section["content"]
                            )
                            modified = True
                        if "flashcard" not in section:
                            section["flashcard"] = generate_flashcard_for_section(
                                section["section"], section["title"], section["content"]
                            )
                            modified = True

                    # Old format with subsections
                    if "subsections" in section:
                        # We attach quiz/flashcard to the main section based on subsections if needed
                        # But typically AIM sections are small enough.
                        # If a section has subsections but no content, we might not be able to generate good content.
                        pass

            if modified:
                with open(f, "w") as file:
                    json.dump(data, file, indent=2)
                count += 1

        except Exception as e:
            print(f"Error processing {f}: {e}")

    print(f"Updated {count} AIM files.")


def main():
    process_far_files()
    process_aim_files()


if __name__ == "__main__":
    main()
