#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Compatibility entry point for generating the web study metadata."""

import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent


def main() -> None:
    subprocess.run(
        ["node", str(SCRIPT_DIR / "generate_study_metadata.js"), *sys.argv[1:]],
        check=True,
    )


if __name__ == "__main__":
    main()
