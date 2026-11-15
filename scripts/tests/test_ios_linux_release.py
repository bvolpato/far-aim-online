import argparse
import importlib.util
import io
import json
import os
import plistlib
import subprocess
import tarfile
from pathlib import Path
from unittest.mock import patch

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "mobile/ios/release-linux.py"
SPEC = importlib.util.spec_from_file_location("faraim_linux_release", SCRIPT)
assert SPEC and SPEC.loader
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
SOURCE_SHA = "a" * 40


@pytest.fixture
def native_archive(tmp_path):
    root = tmp_path / "native-ios-release"
    application = "Application.xcarchive/Products/Applications/FARAIMPro.app"
    app = root / application
    app.mkdir(parents=True)
    info = {
        "CFBundleIdentifier": "com.faraimpro.ios",
        "CFBundleShortVersionString": "1.1.0",
        "CFBundleVersion": "12",
        "MinimumOSVersion": "17.0",
        "CFBundleSupportedPlatforms": ["iPhoneOS"],
        "CFBundleExecutable": "FARAIMPro",
        "DTPlatformName": "iphoneos",
        "DTPlatformVersion": "27.2",
        "DTSDKName": "iphoneos27.2",
        "DTSDKBuild": "24C10",
        "DTXcode": "2720",
        "DTXcodeBuild": "27B52",
    }
    (app / "Info.plist").write_bytes(plistlib.dumps(info))
    (app / "FARAIMPro").write_bytes(b"fixture executable; never signed")
    (app / "FARAIMPro").chmod(0o755)
    symbols = (
        root
        / "Application.xcarchive/dSYMs/FARAIMPro.app.dSYM/Contents/Resources/DWARF/FARAIMPro"
    )
    symbols.parent.mkdir(parents=True)
    symbols.write_bytes(b"fixture symbols")
    (root / "signing-entitlements.plist").write_bytes(plistlib.dumps({}))
    provenance = {
        "repository": "bvolpato/far-aim-online",
        "sourceCommit": SOURCE_SHA,
        "application": application,
        "bundleId": info["CFBundleIdentifier"],
        "shortVersion": "1.1.0",
        "buildNumber": "12",
        "minimumOSVersion": "17.0",
        "sdkVersion": "27.2",
        "sdkBuild": "24C10",
        "xcodeVersion": "27.2",
        "xcodeBuild": "27B52",
        "signing": "unsigned",
    }
    (root / "provenance.json").write_text(json.dumps(provenance))
    return root, app, info, provenance


@pytest.mark.parametrize(
    "field,value",
    [
        ("repository", "bvolpato/brutv"),
        ("sourceCommit", "b" * 40),
        ("signing", "signed"),
        ("xcodeVersion", "27.1"),
        ("sdkVersion", "26.0"),
        ("application", "../outside.app"),
        ("bundleId", "com.bvolpato.brutv"),
    ],
)
def test_rejects_provenance_mismatches(native_archive, field, value):
    root, _, _, provenance = native_archive
    provenance[field] = value
    (root / "provenance.json").write_text(json.dumps(provenance))
    with pytest.raises(ValueError):
        release.validate_archive(root, SOURCE_SHA)


@pytest.mark.parametrize(
    "field,value",
    [
        ("CFBundleIdentifier", "com.bvolpato.brutv"),
        ("CFBundleVersion", "13"),
        ("CFBundleShortVersionString", "2.0"),
        ("CFBundleSupportedPlatforms", ["iPhoneSimulator"]),
        ("DTSDKName", "iphoneos26.0"),
        ("DTXcodeBuild", "27A99"),
        ("DTSDKBuild", "24C99"),
    ],
)
def test_rejects_application_metadata_mismatches(native_archive, field, value):
    root, app, info, _ = native_archive
    info[field] = value
    (app / "Info.plist").write_bytes(plistlib.dumps(info))
    with pytest.raises(ValueError, match=field):
        release.validate_archive(root, SOURCE_SHA)


def test_requires_native_symbols_and_archived_entitlements(native_archive):
    root, app, info, _ = native_archive
    assert release.validate_archive(root, SOURCE_SHA) == (
        root / "Application.xcarchive/Products/Applications/FARAIMPro.app",
        root / "signing-entitlements.plist",
        info,
    )
    symbols = next((root / "Application.xcarchive/dSYMs").rglob("DWARF/FARAIMPro"))
    symbols.unlink()
    with pytest.raises(ValueError, match="dSYM"):
        release.validate_archive(root, SOURCE_SHA)
    symbols.write_bytes(b"fixture symbols")
    (root / "signing-entitlements.plist").unlink()
    with pytest.raises(ValueError, match="signing-entitlements"):
        release.validate_archive(root, SOURCE_SHA)
    (root / "signing-entitlements.plist").write_bytes(plistlib.dumps({}))
    (app / "_CodeSignature").mkdir()
    with pytest.raises(ValueError, match="unsigned"):
        release.validate_archive(root, SOURCE_SHA)


def test_materializes_pinned_git_objects_instead_of_working_tree(tmp_path, monkeypatch):
    archive_bytes = io.BytesIO()
    with tarfile.open(fileobj=archive_bytes, mode="w") as archive:
        for name in release.HELPER_FILES:
            member = tarfile.TarInfo(str(release.HELPER_ROOT / name))
            content = b"pinned helper contents"
            member.size = len(content)
            archive.addfile(member, io.BytesIO(content))
    repository = tmp_path / "repository"
    dirty_helper = repository / release.HELPER_ROOT / "release-linux.py"
    dirty_helper.parent.mkdir(parents=True)
    dirty_helper.write_text("unreviewed working tree contents")
    calls = []

    def git_archive(command, **kwargs):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, archive_bytes.getvalue(), b"")

    monkeypatch.setattr(release.subprocess, "run", git_archive)
    helper = release.materialize_helpers(repository, tmp_path / "extracted")
    assert helper.read_text() == "pinned helper contents"
    assert dirty_helper.read_text() == "unreviewed working tree contents"
    assert calls == [
        [
            "git",
            "-C",
            str(repository),
            "archive",
            "--format=tar",
            release.HELPER_COMMIT,
            "--",
            *(str(release.HELPER_ROOT / name) for name in release.HELPER_FILES),
        ]
    ]


@pytest.mark.parametrize(
    "preflight,upload", [(True, False), (True, True), (False, False), (False, True)]
)
def test_release_forces_far_identity_and_requires_explicit_upload(
    native_archive, tmp_path, monkeypatch, preflight, upload
):
    root, app, info, _ = native_archive
    signer = tmp_path / "zsign"
    signer.write_text("unused test signer")
    signer.chmod(0o755)
    credential = tmp_path / "fixture-credential"
    credential.write_text("synthetic, never used to sign")
    output = tmp_path / "signed"
    args = argparse.Namespace(
        release_dir=root,
        source_sha=SOURCE_SHA,
        helper_repo=tmp_path,
        output_dir=output,
        preflight=preflight,
        upload=upload,
        testflight_group="Testers" if upload else None,
        whats_new="Offline reading" if upload else None,
    )
    calls = []
    monkeypatch.setattr(
        release, "materialize_helpers", lambda repository, destination: SCRIPT
    )

    def helper_run(command, *, env, **kwargs):
        calls.append((command, env))
        if not preflight:
            artifact = Path(env["IOS_RELEASE_DIR"]) / "export/BruTV.ipa"
            artifact.parent.mkdir(parents=True)
            artifact.write_bytes(b"synthetic IPA; never signed or uploaded")
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(release.subprocess, "run", helper_run)
    with patch.dict(
        os.environ,
        {
            "IOS_TEAM_ID": "TESTTEAM01",
            "IOS_ZSIGN": str(signer),
            "IOS_P12_PASSWORD": "",
            "IOS_CERTIFICATE_PATH": str(credential),
            "IOS_PROVISIONING_PROFILE_PATH": str(credential),
            "IOS_BUNDLE_ID": "com.bvolpato.brutv",
            "IOS_APP_STORE_ID": "wrong-app",
            "IOS_BUILD_NUMBER": "999",
            "IOS_ENTITLEMENTS_PATH": "wrong-entitlements",
            "IOS_RELEASE_DIR": "wrong-output",
        },
        clear=True,
    ):
        release.release(args)
    command, env = calls[0]
    assert command[:8] == [
        "uv",
        "run",
        "--script",
        str(SCRIPT),
        "--platform",
        "ios",
        "--app",
        str(app),
    ]
    assert ("--upload" in command) is upload
    assert ("--preflight" in command) is preflight
    assert "--tester" not in command
    assert env["IOS_BUNDLE_ID"] == "com.faraimpro.ios"
    assert env["IOS_APP_STORE_ID"] == "6765584356"
    assert env["IOS_BUILD_NUMBER"] == info["CFBundleVersion"]
    assert env["IOS_ENTITLEMENTS_PATH"] == str(root / "signing-entitlements.plist")
    assert env["IOS_RELEASE_DIR"] == str(output)
    assert (output / "export/FARAIMPro.ipa").exists() is not preflight


def test_rejects_distribution_options_without_upload():
    args = argparse.Namespace(upload=False, testflight_group="Testers", whats_new=None)
    with pytest.raises(ValueError, match="require --upload"):
        release.release(args)


def test_requires_explicit_signer_and_team(native_archive, tmp_path):
    _, _, info, _ = native_archive
    with patch.dict(os.environ, {}, clear=True), pytest.raises(
        ValueError, match="IOS_TEAM_ID"
    ):
        release.release_environment(tmp_path, tmp_path / "entitlements.plist", info)
    with patch.dict(
        os.environ,
        {
            "IOS_TEAM_ID": "TESTTEAM01",
            "IOS_P12_PASSWORD": "",
            "IOS_CERTIFICATE_BASE64": "fixture",
            "IOS_PROVISIONING_PROFILE_BASE64": "fixture",
        },
        clear=True,
    ):
        with pytest.raises(ValueError, match="IOS_ZSIGN"):
            release.release_environment(tmp_path, tmp_path / "entitlements.plist", info)
