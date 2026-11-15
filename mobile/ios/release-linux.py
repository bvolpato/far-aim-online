#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Validate and sign a native FAR/AIM archive, with optional TestFlight upload."""

from __future__ import annotations

import argparse
import io
import json
import os
import plistlib
import re
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

HELPER_COMMIT = "1f67eff147f52fd43efbbaad3aaf83d096bc7f34"
HELPER_ROOT = Path("mobile/ios/BruTV")
HELPER_FILES = ("release-linux.py", "sign-ipa.py", "upload-build.py")
BUNDLE_ID = "com.faraimpro.ios"
APP_STORE_ID = "6765584356"


def read_plist(path: Path) -> dict:
    try:
        value = plistlib.loads(path.read_bytes())
    except (OSError, ValueError) as error:
        raise ValueError(f"missing or invalid {path.name}") from error
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} must contain a dictionary")
    return value


def validate_archive(release_dir: Path, source_sha: str) -> tuple[Path, Path, dict]:
    if not re.fullmatch(r"[0-9a-f]{40}", source_sha):
        raise ValueError("--source-sha must be the reviewed 40-character commit SHA")
    try:
        provenance = json.loads((release_dir / "provenance.json").read_bytes())
    except (OSError, ValueError) as error:
        raise ValueError("missing or invalid archive provenance.json") from error
    required = {
        "repository": "bvolpato/far-aim-online",
        "sourceCommit": source_sha,
        "bundleId": BUNDLE_ID,
        "signing": "unsigned",
        "xcodeVersion": "27.2",
        "xcodeBuild": "27B52",
        "sdkVersion": "27.2",
    }
    if not isinstance(provenance, dict):
        raise ValueError("archive provenance must contain an object")
    for key, expected in required.items():
        if provenance.get(key) != expected:
            raise ValueError(f"archive provenance has an unexpected {key}")
    relative_app = provenance.get("application")
    if (
        not isinstance(relative_app, str)
        or Path(relative_app).is_absolute()
        or ".." in Path(relative_app).parts
    ):
        raise ValueError("archive provenance has an invalid application path")
    archive = release_dir / "Application.xcarchive"
    app = (release_dir / relative_app).resolve()
    applications = archive / "Products/Applications"
    if (
        not app.is_relative_to(release_dir)
        or app.parent != applications
        or app.suffix != ".app"
        or not app.is_dir()
        or list(applications.glob("*.app")) != [app]
    ):
        raise ValueError(
            "archive must contain exactly the native application named in provenance"
        )
    if not (app / "Info.plist").resolve().is_relative_to(app):
        raise ValueError("application Info.plist must be inside the native application")
    info = read_plist(app / "Info.plist")
    for field, expected in {
        "CFBundleIdentifier": BUNDLE_ID,
        "CFBundleShortVersionString": provenance.get("shortVersion"),
        "CFBundleVersion": provenance.get("buildNumber"),
        "MinimumOSVersion": provenance.get("minimumOSVersion"),
        "CFBundleSupportedPlatforms": ["iPhoneOS"],
        "DTPlatformName": "iphoneos",
        "DTPlatformVersion": "27.2",
        "DTSDKName": "iphoneos27.2",
        "DTSDKBuild": provenance.get("sdkBuild"),
        "DTXcode": "2720",
        "DTXcodeBuild": "27B52",
    }.items():
        if expected is None or info.get(field) != expected:
            raise ValueError(f"archive Info.plist has an unexpected {field}")
    for field in ("CFBundleShortVersionString", "MinimumOSVersion"):
        if not re.fullmatch(r"[0-9]+(?:\.[0-9]+){0,2}", str(info.get(field, ""))):
            raise ValueError(f"archive Info.plist has an invalid {field}")
    if not re.fullmatch(r"[1-9][0-9]*", str(info["CFBundleVersion"])):
        raise ValueError("archive build number must be a positive integer")
    if not re.fullmatch(r"[0-9]+[A-Z][0-9]+[a-z]?", str(info["DTSDKBuild"])):
        raise ValueError("archive must record the actual Apple SDK build")
    executable = info.get("CFBundleExecutable", "")
    if (
        not isinstance(executable, str)
        or not executable
        or Path(executable).name != executable
        or not (app / executable).resolve().is_relative_to(app)
        or not (app / executable).is_file()
        or not os.access(app / executable, os.X_OK)
    ):
        raise ValueError("archive has no executable application binary")
    if (app / "_CodeSignature").exists() or (app / "embedded.mobileprovision").exists():
        raise ValueError("release input must be the unsigned native archive")
    symbols = (
        archive / "dSYMs" / f"{app.name}.dSYM" / "Contents/Resources/DWARF" / executable
    )
    if (
        not symbols.resolve().is_relative_to(archive)
        or not symbols.is_file()
        or not symbols.stat().st_size
    ):
        raise ValueError("archive is missing its application dSYM")
    entitlements = release_dir / "signing-entitlements.plist"
    if not entitlements.resolve().is_relative_to(release_dir):
        raise ValueError("signing entitlements must be inside the release directory")
    read_plist(entitlements)
    return app, entitlements, info


def materialize_helpers(repository: Path, destination: Path) -> Path:
    result = subprocess.run(
        [
            "git",
            "-C",
            str(repository),
            "archive",
            "--format=tar",
            HELPER_COMMIT,
            "--",
            *(str(HELPER_ROOT / name) for name in HELPER_FILES),
        ],
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise ValueError(
            f"--helper-repo must contain reviewed helper commit {HELPER_COMMIT}"
        )
    with tarfile.open(fileobj=io.BytesIO(result.stdout), mode="r:") as archive:
        archive.extractall(destination, filter="data")
    helper = destination / HELPER_ROOT / "release-linux.py"
    if not all((helper.parent / name).is_file() for name in HELPER_FILES):
        raise ValueError("pinned helper archive is incomplete")
    return helper


def release_environment(output: Path, entitlements: Path, info: dict) -> dict[str, str]:
    env = dict(os.environ)
    if not re.fullmatch(r"[A-Z0-9]{10}", env.get("IOS_TEAM_ID", "")):
        raise ValueError(
            "set IOS_TEAM_ID explicitly to the distribution certificate team"
        )
    for kind in ("CERTIFICATE", "PROVISIONING_PROFILE"):
        names = (f"IOS_{kind}_PATH", f"IOS_{kind}_BASE64")
        if sum(bool(env.get(name)) for name in names) != 1:
            raise ValueError(f"set exactly one of {names[0]} and {names[1]}")
    if "IOS_P12_PASSWORD" not in env:
        raise ValueError(
            "set IOS_P12_PASSWORD; an empty value is allowed for an unencrypted P12"
        )
    signer = Path(env.get("IOS_ZSIGN", "")).expanduser().resolve()
    if (
        not env.get("IOS_ZSIGN")
        or not signer.is_file()
        or not os.access(signer, os.X_OK)
    ):
        raise ValueError("set IOS_ZSIGN to an explicit executable Linux signer path")
    for name in (
        "IOS_CERTIFICATE_PATH",
        "IOS_PROVISIONING_PROFILE_PATH",
        "IOS_APPLE_ROOT_CA_PATH",
        "IOS_ASC_PRIVATE_KEY_PATH",
        "ASC_PRIVATE_KEY_PATH",
    ):
        if env.get(name):
            path = Path(env[name]).expanduser().resolve()
            if not path.is_file():
                raise ValueError(f"{name} must identify an existing file")
            env[name] = str(path)
    env.update(
        {
            "IOS_ZSIGN": str(signer),
            "IOS_RELEASE_DIR": str(output),
            "IOS_ENTITLEMENTS_PATH": str(entitlements),
            "IOS_BUNDLE_ID": BUNDLE_ID,
            "IOS_APP_STORE_ID": APP_STORE_ID,
            "IOS_BUILD_NUMBER": str(info["CFBundleVersion"]),
            "IOS_MARKETING_VERSION": str(info["CFBundleShortVersionString"]),
        }
    )
    return env


def release(args: argparse.Namespace) -> None:
    if (args.testflight_group or args.whats_new is not None) and not args.upload:
        raise ValueError("--testflight-group and --whats-new require --upload")
    if args.whats_new is not None and not args.testflight_group:
        raise ValueError("--whats-new requires an existing --testflight-group")
    source = args.release_dir.expanduser().resolve()
    output = args.output_dir.expanduser().resolve()
    if output.is_relative_to(source):
        raise ValueError("--output-dir must be outside the unsigned release directory")
    app, entitlements, info = validate_archive(source, args.source_sha)
    exported = output / "export/BruTV.ipa"
    renamed = output / "export/FARAIMPro.ipa"
    if not exported.parent.resolve().is_relative_to(output):
        raise ValueError("signed export directory must be inside --output-dir")
    if not args.preflight and any(
        path.exists() or path.is_symlink() for path in (exported, renamed)
    ):
        raise ValueError("output already contains an IPA; select a new --output-dir")
    env = release_environment(output, entitlements, info)
    with tempfile.TemporaryDirectory(prefix="faraim-release-helpers-") as temporary:
        helper = materialize_helpers(
            args.helper_repo.expanduser().resolve(), Path(temporary)
        )
        command = [
            "uv",
            "run",
            "--script",
            str(helper),
            "--platform",
            "ios",
            "--app",
            str(app),
        ]
        if args.preflight:
            command.append("--preflight")
        if args.upload:
            command.append("--upload")
        if args.testflight_group:
            command.extend(["--testflight-group", args.testflight_group])
        if args.whats_new is not None:
            command.extend(["--whats-new", args.whats_new])
        result = subprocess.run(command, env=env, cwd=helper.parent, check=False)
        if result.returncode:
            raise ValueError(f"pinned release helper failed (exit {result.returncode})")
    if args.preflight:
        print(
            "Native FAR/AIM archive and release prerequisites passed; nothing signed or uploaded."
        )
    else:
        if not exported.is_file() or not exported.stat().st_size:
            raise ValueError("pinned release helper did not produce a signed IPA")
        exported.rename(renamed)
        print(f"FAR/AIM IPA: {renamed}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--release-dir",
        type=Path,
        required=True,
        help="downloaded native-ios-release directory",
    )
    parser.add_argument(
        "--source-sha", required=True, help="reviewed archive source commit"
    )
    parser.add_argument(
        "--helper-repo",
        type=Path,
        required=True,
        help="local BruTV repository containing the pinned helper commit",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="separate directory for signed output",
    )
    parser.add_argument(
        "--preflight", action="store_true", help="validate without signing or uploading"
    )
    parser.add_argument(
        "--upload", action="store_true", help="upload and wait for Apple processing"
    )
    parser.add_argument(
        "--testflight-group", help="distribute to an existing internal TestFlight group"
    )
    parser.add_argument(
        "--whats-new", help="What to Test notes for that existing group"
    )
    try:
        release(parser.parse_args())
    except (OSError, ValueError, tarfile.TarError) as error:
        print(f"error: FAR/AIM release stopped: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
