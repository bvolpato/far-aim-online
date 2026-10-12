#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Run a local release with verified private GCS credentials in temporary files."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import signal
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
PROJECT = "far-aim-online-signing-3207647"
BUCKET = "far-aim-online-release-secrets-3207647"
MANIFEST_OBJECT = "release-manifest.json"
MAX_OBJECT_BYTES = 16 * 1024 * 1024
RELEASE_CLEANUP_SECONDS = 30
OBJECT_NAMES = {
    "android": {
        "keystore": "android/release.keystore",
        "properties": "android/keystore.properties",
    },
    "ios": {
        "certificate": "ios/ios_distribution.p12",
        "profile": "ios/FARAIMPro_App_Store_Distribution.mobileprovision",
        "password": "ios/p12-password.txt",
    },
}
SECRET_ENVIRONMENT = {
    "ANDROID_KEYSTORE_BASE64",
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEY_PASSWORD",
    "ANDROID_KEY_ALIAS",
    "IOS_CERTIFICATE_BASE64",
    "IOS_PROVISIONING_PROFILE_BASE64",
    "IOS_P12_PASSWORD",
}


class CredentialError(Exception):
    pass


def gcloud(*arguments: str, account: str | None = None) -> bytes:
    account_arguments = [f"--account={account}"] if account is not None else []
    try:
        result = subprocess.run(
            [
                "gcloud",
                "--quiet",
                "--verbosity=error",
                "--no-log-http",
                *account_arguments,
                *arguments,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise CredentialError("Private credential operation could not complete") from error
    if result.returncode:
        # Credential command output can contain private metadata. Never relay it to logs.
        raise CredentialError(
            "Private credential operation failed; check user login and bucket access"
        )
    return result.stdout


def private_json(raw: bytes) -> Any:
    if len(raw) > 64 * 1024:
        raise CredentialError("Private metadata exceeds the allowed size")
    try:
        return json.loads(raw)
    except (ValueError, UnicodeError) as error:
        raise CredentialError("Private metadata is invalid JSON") from error


def check_user_authentication() -> str:
    if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
        raise CredentialError(
            "Private signing credentials are unavailable to CI; use unsigned builds"
        )
    overrides = {
        "GOOGLE_APPLICATION_CREDENTIALS",
        "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
        "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
        "CLOUDSDK_AUTH_ACCESS_TOKEN",
        "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE",
        "CLOUDSDK_CORE_ACCOUNT",
    }
    if overrides & os.environ.keys():
        raise CredentialError("Credential overrides are forbidden; use gcloud user login")
    accounts = private_json(gcloud("auth", "list", "--filter=status:ACTIVE", "--format=json"))
    if not isinstance(accounts, list) or len(accounts) != 1:
        raise CredentialError("Exactly one active gcloud user account is required")
    account = accounts[0].get("account") if isinstance(accounts[0], dict) else None
    if (
        not isinstance(account, str)
        or "@" not in account
        or account.endswith("gserviceaccount.com")
    ):
        raise CredentialError("A gcloud user account is required; service accounts are forbidden")
    for setting in ("auth/impersonate_service_account", "auth/credential_file_override"):
        value = gcloud("config", "get-value", setting).strip()
        if value not in (b"", b"(unset)"):
            raise CredentialError(
                "Configured credential overrides are forbidden; use gcloud user login"
            )
    return account


def owner_only_policy(policy: Any, account: str) -> bool:
    bindings = policy.get("bindings") if isinstance(policy, dict) else None
    return (
        isinstance(bindings, list)
        and bool(bindings)
        and all(
            isinstance(binding, dict) and binding.get("members") == [f"user:{account}"]
            for binding in bindings
        )
    )


def check_private_bucket(account: str) -> None:
    project = private_json(
        gcloud("projects", "describe", PROJECT, "--format=json", account=account)
    )
    if (
        not isinstance(project, dict)
        or project.get("projectId") != PROJECT
        or project.get("lifecycleState") != "ACTIVE"
        or project.get("parent") is not None
        or re.fullmatch(r"[1-9][0-9]*", str(project.get("projectNumber"))) is None
    ):
        raise CredentialError(
            "Signing project must be active and isolated from organization or folder access"
        )
    project_policy = private_json(
        gcloud("projects", "get-iam-policy", PROJECT, "--format=json", account=account)
    )
    if not owner_only_policy(project_policy, account):
        raise CredentialError("Signing project must have owner-only IAM bindings")
    metadata = private_json(
        gcloud(
            "storage",
            "buckets",
            "describe",
            f"gs://{BUCKET}",
            "--raw",
            "--format=json",
            account=account,
        )
    )
    configuration = metadata.get("iamConfiguration", {}) if isinstance(metadata, dict) else {}
    uniform_access = (
        configuration.get("uniformBucketLevelAccess", {}) if isinstance(configuration, dict) else {}
    )
    if (
        not isinstance(metadata, dict)
        or str(metadata.get("projectNumber")) != str(project["projectNumber"])
        or not isinstance(configuration, dict)
        or configuration.get("publicAccessPrevention") != "enforced"
        or not isinstance(uniform_access, dict)
        or uniform_access.get("enabled") is not True
    ):
        raise CredentialError(
            "Signing bucket must enforce public-access prevention and uniform access"
        )
    policy = private_json(
        gcloud(
            "storage",
            "buckets",
            "get-iam-policy",
            f"gs://{BUCKET}",
            "--format=json",
            account=account,
        )
    )
    if not owner_only_policy(policy, account):
        raise CredentialError("Signing bucket must have owner-only direct IAM bindings")


def generation(value: Any) -> str:
    if not isinstance(value, str) or re.fullmatch(r"[1-9][0-9]{0,19}", value) is None:
        raise CredentialError("An exact positive object generation is required")
    return value


def selected_objects(manifest: Any, platform: str) -> dict[str, dict[str, Any]]:
    if (
        not isinstance(manifest, dict)
        or type(manifest.get("schemaVersion")) is not int
        or manifest["schemaVersion"] != 1
        or manifest.get("bucket") != BUCKET
    ):
        raise CredentialError("Private manifest schema or bucket does not match")
    platforms = manifest.get("platforms")
    selected = platforms.get(platform) if isinstance(platforms, dict) else None
    if not isinstance(selected, dict) or selected.get("state") != "ready":
        raise CredentialError(
            f"{platform} signing is quarantined or unavailable; replacement credentials are required"
        )
    objects = selected.get("objects")
    if not isinstance(objects, dict) or objects.keys() != OBJECT_NAMES[platform].keys():
        raise CredentialError(
            "Private manifest does not contain exactly the required credential roles"
        )
    for role, specification in objects.items():
        if (
            not isinstance(specification, dict)
            or specification.get("name") != OBJECT_NAMES[platform][role]
        ):
            raise CredentialError("Private manifest contains an unexpected credential object path")
        generation(specification.get("generation"))
        if (
            not isinstance(specification.get("sha256"), str)
            or re.fullmatch(r"[0-9a-f]{64}", specification["sha256"]) is None
        ):
            raise CredentialError("Private manifest contains an invalid SHA256 checksum")
        if (
            type(specification.get("size")) is not int
            or not 0 < specification["size"] <= MAX_OBJECT_BYTES
        ):
            raise CredentialError("Private manifest contains an invalid credential size")
    return objects


def fetch_object(specification: dict[str, Any], directory: Path, account: str) -> Path:
    uri = f"gs://{BUCKET}/{specification['name']}#{specification['generation']}"
    metadata = private_json(
        gcloud("storage", "objects", "describe", uri, "--raw", "--format=json", account=account)
    )
    if (
        not isinstance(metadata, dict)
        or str(metadata.get("generation")) != specification["generation"]
        or str(metadata.get("size")) != str(specification["size"])
    ):
        raise CredentialError("Pinned credential object metadata does not match the manifest")
    destination = directory / Path(specification["name"]).name
    with destination.open("xb"):
        pass
    destination.chmod(0o600)
    gcloud("storage", "cp", "--do-not-decompress", uri, str(destination), account=account)
    metadata = destination.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size != specification["size"]:
        raise CredentialError("Downloaded credential size or file type does not match the manifest")
    destination.chmod(0o600)
    if hashlib.sha256(destination.read_bytes()).hexdigest() != specification["sha256"]:
        raise CredentialError("Downloaded credential checksum does not match the manifest")
    return destination


def android_properties(properties: Path, keystore: Path) -> None:
    # Retain Java Properties values as data. Never source this file in a shell.
    lines = properties.read_bytes().decode("iso-8859-1").splitlines()
    expected = {"storeFile", "storePassword", "keyPassword", "keyAlias"}
    found: set[str] = set()
    output: list[str] = []
    encoded_path = keystore.as_posix().encode("utf-16-be")
    escaped_path = "".join(
        f"\\u{int.from_bytes(encoded_path[index : index + 2], 'big'):04x}"
        for index in range(0, len(encoded_path), 2)
    )
    for line in lines:
        if not line.strip() or line.lstrip().startswith(("#", "!")):
            output.append(line)
            continue
        if (len(line) - len(line.rstrip("\\"))) % 2:
            raise CredentialError("Android signing properties must not use line continuations")
        match = re.match(r"^\s*([A-Za-z][A-Za-z0-9]*)\s*[:=](.*)$", line)
        if match is None or match[1] not in expected or match[1] in found or not match[2].strip():
            raise CredentialError(
                "Android signing properties are incomplete or contain unexpected keys"
            )
        found.add(match[1])
        output.append(f"storeFile={escaped_path}" if match[1] == "storeFile" else line)
    if found != expected:
        raise CredentialError("Android signing properties are incomplete")
    properties.write_bytes(("\n".join(output) + "\n").encode("iso-8859-1"))


def credential_cache() -> Path:
    cache = Path.home() / ".cache" / "far-aim-online" / "release-credentials"
    if cache.is_symlink() or cache.resolve().is_relative_to(ROOT_DIR):
        raise CredentialError(
            "Credential cache must be outside the repository and must not be a symlink"
        )
    cache.mkdir(mode=0o700, parents=True, exist_ok=True)
    metadata = cache.stat()
    if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) & 0o077:
        raise CredentialError(
            "Credential cache must be owned by the current user with private permissions"
        )
    return cache


def run_command(command: list[str], environment: dict[str, str]) -> int:
    child: subprocess.Popen | None = None
    interrupted: int | None = None
    deadline = 0.0

    def signal_group(signum: int) -> None:
        if child is not None:
            try:
                os.killpg(child.pid, signum)
            except ProcessLookupError:
                pass

    def forward(signum: int, _frame: Any) -> None:
        nonlocal interrupted, deadline
        if interrupted is None:
            interrupted = signum
            deadline = time.monotonic() + RELEASE_CLEANUP_SECONDS
            signal_group(signum)

    original = {
        signum: signal.signal(signum, forward) for signum in (signal.SIGINT, signal.SIGTERM)
    }
    try:
        child = subprocess.Popen(command, env=environment, start_new_session=True)
        if interrupted is not None:
            signal_group(interrupted)
        while child.poll() is None:
            if interrupted is not None and time.monotonic() >= deadline:
                signal_group(signal.SIGKILL)
                child.wait()
                print("Release credentials: release cleanup timed out", file=sys.stderr)
                break
            try:
                child.wait(timeout=0.1)
            except subprocess.TimeoutExpired:
                pass
        # Stop surviving descendants before the enclosing context removes files.
        signal_group(signal.SIGKILL)
        if interrupted is not None:
            return 128 + interrupted
        return child.returncode
    finally:
        for signum, handler in original.items():
            signal.signal(signum, handler)


def run_release(platform: str, manifest_generation: str, command: list[str]) -> int:
    manifest_generation = generation(manifest_generation)
    if not command:
        raise CredentialError("A local release command is required")
    account = check_user_authentication()
    check_private_bucket(account)
    manifest = private_json(
        gcloud(
            "storage",
            "cat",
            f"gs://{BUCKET}/{MANIFEST_OBJECT}#{manifest_generation}",
            account=account,
        )
    )
    objects = selected_objects(manifest, platform)
    with tempfile.TemporaryDirectory(prefix=f"{platform}-", dir=credential_cache()) as temporary:
        directory = Path(temporary)
        files = {
            role: fetch_object(specification, directory, account)
            for role, specification in objects.items()
        }
        environment = {
            name: value for name, value in os.environ.items() if name not in SECRET_ENVIRONMENT
        }
        environment["RELEASE_CREDENTIALS_PLATFORM"] = platform
        environment["RELEASE_CREDENTIALS_DIR"] = str(directory)
        if platform == "android":
            android_properties(files["properties"], files["keystore"])
            environment["ANDROID_KEYSTORE_PATH"] = str(files["keystore"])
            environment["ANDROID_KEYSTORE_PROPERTIES_PATH"] = str(files["properties"])
        else:
            environment["IOS_CERTIFICATE_PATH"] = str(files["certificate"])
            environment["IOS_PROVISIONING_PROFILE_PATH"] = str(files["profile"])
            environment["IOS_P12_PASSWORD_FILE"] = str(files["password"])
        return run_command(command, environment)


def interrupt(_signum: int, _frame: Any) -> None:
    raise KeyboardInterrupt


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=tuple(OBJECT_NAMES), required=True)
    parser.add_argument(
        "--manifest-generation", default=os.environ.get("RELEASE_CREDENTIALS_MANIFEST_GENERATION")
    )
    parser.add_argument("command", nargs=argparse.REMAINDER)
    arguments = parser.parse_args(argv)
    os.umask(0o077)
    original_term_handler = signal.signal(signal.SIGTERM, interrupt)
    command = arguments.command[1:] if arguments.command[:1] == ["--"] else arguments.command
    try:
        return run_release(arguments.platform, arguments.manifest_generation, command)
    except (CredentialError, OSError, KeyboardInterrupt) as error:
        message = (
            str(error)
            if isinstance(error, CredentialError)
            else "Private release interrupted or unavailable"
        )
        print(f"Release credentials: {message}", file=sys.stderr)
        return 1
    finally:
        signal.signal(signal.SIGTERM, original_term_handler)


if __name__ == "__main__":
    raise SystemExit(main())
