import hashlib
import json
import os
import signal
import stat
import subprocess
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import release_credentials as credentials  # noqa: E402

ACCOUNT = "owner@example.com"
PROPERTIES = (
    b"storeFile=release.keystore\nstorePassword=synthetic-only\n"
    b"keyPassword=synthetic-only\nkeyAlias=release\n"
)


def ready_manifest():
    payloads = {
        "android/release.keystore": b"synthetic-keystore",
        "android/keystore.properties": PROPERTIES,
    }
    manifest = {
        "schemaVersion": 1,
        "bucket": credentials.BUCKET,
        "platforms": {
            "android": {
                "state": "ready",
                "objects": {
                    role: {
                        "name": name,
                        "generation": str(index + 100),
                        "sha256": hashlib.sha256(payloads[name]).hexdigest(),
                        "size": len(payloads[name]),
                    }
                    for index, (role, name) in enumerate(
                        credentials.OBJECT_NAMES["android"].items()
                    )
                },
            },
            "ios": {"state": "quarantined", "objects": {}},
        },
    }
    return manifest, payloads


def fake_cloud(monkeypatch, tmp_path, *, manifest=None, payloads=None, corrupt=False):
    default_manifest, default_payloads = ready_manifest()
    manifest = default_manifest if manifest is None else manifest
    payloads = default_payloads if payloads is None else payloads
    for name in ("CI", "GITHUB_ACTIONS", "GOOGLE_APPLICATION_CREDENTIALS", "CLOUDSDK_CORE_ACCOUNT"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(credentials.Path, "home", lambda: tmp_path)
    calls = []

    def cloud(*arguments, account=None):
        calls.append((arguments, account))
        if arguments[:2] == ("auth", "list"):
            return json.dumps([{"account": ACCOUNT, "status": "ACTIVE"}]).encode()
        if arguments[:2] == ("config", "get-value"):
            return b"(unset)\n"
        assert account == ACCOUNT
        if arguments[:2] == ("projects", "describe"):
            assert arguments[2] == credentials.PROJECT
            return json.dumps(
                {
                    "projectId": credentials.PROJECT,
                    "projectNumber": "123456789",
                    "lifecycleState": "ACTIVE",
                }
            ).encode()
        if arguments[:2] == ("projects", "get-iam-policy"):
            assert arguments[2] == credentials.PROJECT
            return json.dumps(
                {"bindings": [{"role": "roles/owner", "members": [f"user:{ACCOUNT}"]}]}
            ).encode()
        if arguments[:3] == ("storage", "buckets", "describe"):
            return json.dumps(
                {
                    "projectNumber": "123456789",
                    "iamConfiguration": {
                        "publicAccessPrevention": "enforced",
                        "uniformBucketLevelAccess": {"enabled": True},
                    },
                }
            ).encode()
        if arguments[:3] == ("storage", "buckets", "get-iam-policy"):
            return json.dumps(
                {"bindings": [{"role": "roles/storage.admin", "members": [f"user:{ACCOUNT}"]}]}
            ).encode()
        if arguments[:2] == ("storage", "cat"):
            assert arguments[2] == f"gs://{credentials.BUCKET}/release-manifest.json#123"
            return json.dumps(manifest).encode()
        if arguments[:3] == ("storage", "objects", "describe"):
            uri = arguments[3]
            specification = next(
                specification
                for specification in manifest["platforms"]["android"]["objects"].values()
                if uri
                == f"gs://{credentials.BUCKET}/{specification['name']}#{specification['generation']}"
            )
            return json.dumps(
                {"generation": specification["generation"], "size": str(specification["size"])}
            ).encode()
        if arguments[:2] == ("storage", "cp"):
            assert arguments[2] == "--do-not-decompress"
            uri = arguments[3]
            specification = next(
                specification
                for specification in manifest["platforms"]["android"]["objects"].values()
                if uri
                == f"gs://{credentials.BUCKET}/{specification['name']}#{specification['generation']}"
            )
            payload = payloads[specification["name"]]
            Path(arguments[4]).write_bytes(b"X" * len(payload) if corrupt else payload)
            return b""
        raise AssertionError(arguments)

    monkeypatch.setattr(credentials, "gcloud", cloud)
    return calls


def test_private_release_uses_pinned_files_and_cleans_them_after_failure(tmp_path, monkeypatch):
    calls = fake_cloud(monkeypatch, tmp_path)
    monkeypatch.setenv("IOS_P12_PASSWORD", "must-not-reach-child")
    temporary = None

    def child(command, env):
        nonlocal temporary
        assert command == ["/trusted/release", "--flag"]
        assert "IOS_P12_PASSWORD" not in env
        temporary = Path(env["RELEASE_CREDENTIALS_DIR"])
        properties = Path(env["ANDROID_KEYSTORE_PROPERTIES_PATH"])
        keystore = Path(env["ANDROID_KEYSTORE_PATH"])
        assert not temporary.is_relative_to(credentials.ROOT_DIR)
        assert stat.S_IMODE(temporary.stat().st_mode) == 0o700
        assert stat.S_IMODE(properties.stat().st_mode) == 0o600
        assert stat.S_IMODE(keystore.stat().st_mode) == 0o600
        text = properties.read_text()
        encoded_path = text.splitlines()[0].split("=", 1)[1]
        assert encoded_path.encode().decode("unicode_escape") == str(keystore)
        assert text.splitlines()[1:] == PROPERTIES.decode().splitlines()[1:]
        return 42

    monkeypatch.setattr(credentials, "run_command", child)
    assert credentials.run_release("android", "123", ["/trusted/release", "--flag"]) == 42
    assert temporary is not None and not temporary.exists()
    assert len([call for call in calls if call[0][:2] == ("storage", "cp")]) == 2


def test_quarantined_ios_never_downloads_credentials_or_executes_child(tmp_path, monkeypatch):
    calls = fake_cloud(monkeypatch, tmp_path)
    child = []
    monkeypatch.setattr(credentials, "run_command", lambda *args, **kwargs: child.append(args))

    with pytest.raises(credentials.CredentialError, match="quarantined"):
        credentials.run_release("ios", "123", ["/trusted/release"])

    assert child == []
    assert all(call[0][:2] != ("storage", "cp") for call in calls)


def test_checksum_mismatch_stops_release_and_removes_temporary_files(tmp_path, monkeypatch):
    fake_cloud(monkeypatch, tmp_path, corrupt=True)
    child = []
    monkeypatch.setattr(credentials, "run_command", lambda *args, **kwargs: child.append(args))

    with pytest.raises(credentials.CredentialError, match="checksum"):
        credentials.run_release("android", "123", ["/trusted/release"])

    assert child == []
    assert list(credentials.credential_cache().iterdir()) == []


@pytest.mark.parametrize(
    "variable",
    [
        "CI",
        "GITHUB_ACTIONS",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
    ],
)
def test_ci_and_credential_overrides_fail_before_cloud_access(monkeypatch, variable):
    monkeypatch.setenv(variable, "configured")
    calls = []
    monkeypatch.setattr(credentials, "gcloud", lambda *args, **kwargs: calls.append(args))

    with pytest.raises(credentials.CredentialError):
        credentials.check_user_authentication()

    assert calls == []


def test_service_account_authentication_is_rejected(monkeypatch):
    for name in ("CI", "GITHUB_ACTIONS", "GOOGLE_APPLICATION_CREDENTIALS"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(
        credentials,
        "gcloud",
        lambda *args, **kwargs: b'[{"account":"signer@project.iam.gserviceaccount.com"}]',
    )

    with pytest.raises(credentials.CredentialError, match="service accounts"):
        credentials.check_user_authentication()


@pytest.mark.parametrize(
    "change",
    [
        {"name": "android/../../private.key"},
        {"name": "android/other.keystore"},
        {"generation": "100#101"},
        {"generation": None},
        {"sha256": "bad"},
        {"size": True},
        {"size": credentials.MAX_OBJECT_BYTES + 1},
    ],
)
def test_manifest_rejects_unexpected_paths_unpinned_generations_and_bad_checksums(change):
    manifest, _ = ready_manifest()
    manifest["platforms"]["android"]["objects"]["keystore"].update(change)

    with pytest.raises(credentials.CredentialError):
        credentials.selected_objects(manifest, "android")


def test_extra_bucket_access_is_rejected(monkeypatch):
    def cloud(*arguments, account=None):
        if arguments[:2] == ("projects", "describe"):
            return json.dumps(
                {
                    "projectId": credentials.PROJECT,
                    "projectNumber": "123456789",
                    "lifecycleState": "ACTIVE",
                }
            ).encode()
        if arguments[:2] == ("projects", "get-iam-policy"):
            return b'{"bindings":[{"members":["user:owner@example.com"]}]}'
        if arguments[2] == "describe":
            return b'{"projectNumber":"123456789","iamConfiguration":{"publicAccessPrevention":"enforced","uniformBucketLevelAccess":{"enabled":true}}}'
        return b'{"bindings":[{"members":["user:owner@example.com","allUsers"]}]}'

    monkeypatch.setattr(credentials, "gcloud", cloud)
    with pytest.raises(credentials.CredentialError, match="owner-only"):
        credentials.check_private_bucket(ACCOUNT)


@pytest.mark.parametrize(
    "change",
    [
        {"parent": {"type": "organization", "id": "123"}},
        {"lifecycleState": "DELETE_REQUESTED"},
        {"projectId": "other-project"},
    ],
)
def test_signing_project_must_be_active_and_have_no_inherited_access(tmp_path, monkeypatch, change):
    calls = fake_cloud(monkeypatch, tmp_path)
    cloud = credentials.gcloud

    def changed_cloud(*arguments, **kwargs):
        raw = cloud(*arguments, **kwargs)
        if arguments[:2] == ("projects", "describe"):
            metadata = json.loads(raw)
            metadata.update(change)
            return json.dumps(metadata).encode()
        return raw

    monkeypatch.setattr(credentials, "gcloud", changed_cloud)
    with pytest.raises(credentials.CredentialError, match="isolated"):
        credentials.run_release("android", "123", ["/trusted/release"])
    assert all(call[0][0] != "storage" for call in calls)


def test_inherited_project_reader_and_wrong_bucket_project_are_rejected(tmp_path, monkeypatch):
    calls = fake_cloud(monkeypatch, tmp_path)
    cloud = credentials.gcloud

    def shared_project(*arguments, **kwargs):
        raw = cloud(*arguments, **kwargs)
        if arguments[:2] == ("projects", "get-iam-policy"):
            policy = json.loads(raw)
            policy["bindings"].append(
                {
                    "role": "roles/storage.admin",
                    "members": ["serviceAccount:old-deployer@example.iam.gserviceaccount.com"],
                }
            )
            return json.dumps(policy).encode()
        return raw

    monkeypatch.setattr(credentials, "gcloud", shared_project)
    with pytest.raises(credentials.CredentialError, match="project.*owner-only"):
        credentials.run_release("android", "123", ["/trusted/release"])
    assert all(call[0][0] != "storage" for call in calls)

    calls.clear()

    def wrong_bucket(*arguments, **kwargs):
        raw = cloud(*arguments, **kwargs)
        if arguments[:3] == ("storage", "buckets", "describe"):
            metadata = json.loads(raw)
            metadata["projectNumber"] = "987654321"
            return json.dumps(metadata).encode()
        return raw

    monkeypatch.setattr(credentials, "gcloud", wrong_bucket)
    with pytest.raises(credentials.CredentialError):
        credentials.run_release("android", "123", ["/trusted/release"])
    assert all(call[0][:2] != ("storage", "cat") for call in calls)


@pytest.mark.parametrize(
    "extra",
    [
        b"storeFile=another.keystore\n",
        b"unexpectedKey=value\n",
        b"storePassword=continued\\\nvalue\n",
    ],
)
def test_android_properties_reject_duplicate_unexpected_or_continued_keys(tmp_path, extra):
    path = tmp_path / "keystore.properties"
    original = PROPERTIES + extra
    path.write_bytes(original)

    with pytest.raises(credentials.CredentialError):
        credentials.android_properties(path, tmp_path / "release.keystore")

    assert path.read_bytes() == original


def test_gcloud_failure_does_not_include_sensitive_stderr(monkeypatch):
    monkeypatch.setattr(
        credentials.subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(
            args, 1, stdout=b"", stderr=b"synthetic-private-value"
        ),
    )

    with pytest.raises(credentials.CredentialError) as caught:
        credentials.gcloud("storage", "cat", "private-object")

    assert "synthetic-private-value" not in str(caught.value)


def test_missing_manifest_pin_fails_before_authentication(monkeypatch):
    called = []
    monkeypatch.setattr(credentials, "check_user_authentication", lambda: called.append(True))

    with pytest.raises(credentials.CredentialError, match="generation"):
        credentials.run_release("android", None, ["/trusted/release"])

    assert called == []


def test_child_status_and_signal_handlers_are_preserved():
    original = {signum: signal.getsignal(signum) for signum in (signal.SIGINT, signal.SIGTERM)}
    assert (
        credentials.run_command([sys.executable, "-c", "raise SystemExit(7)"], dict(os.environ))
        == 7
    )
    assert {signum: signal.getsignal(signum) for signum in original} == original


@pytest.mark.parametrize("interruption", [signal.SIGTERM, signal.SIGINT])
def test_interruption_waits_for_release_cleanup_before_removing_credentials(tmp_path, interruption):
    ready = tmp_path / "ready"
    cleaned = tmp_path / "cleaned"
    driver = """
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import release_credentials as credentials
cache = Path(sys.argv[2]) / 'cache'
cache.mkdir(mode=0o700)
credentials.check_user_authentication = lambda: 'owner@example.com'
credentials.check_private_bucket = lambda account: None
credentials.gcloud = lambda *args, **kwargs: b'{}'
credentials.selected_objects = lambda *args: {'keystore': {'name': 'keystore'}, 'properties': {'name': 'properties'}}
credentials.credential_cache = lambda: cache
credentials.android_properties = lambda *args: None
def fetch(specification, directory, account):
    path = directory / specification['name']
    path.write_bytes(b'synthetic-only')
    return path
credentials.fetch_object = fetch
raise SystemExit(credentials.main(['--platform', 'android', '--manifest-generation', '123', '--', *sys.argv[3:]]))
"""
    child = """
ready="$1"
cleaned="$2"
cleanup() {
  sleep 0.15
  if [[ -f "$ANDROID_KEYSTORE_PATH" ]]; then printf restored > "$cleaned"; fi
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
(trap '' INT TERM; while true; do sleep 1; done) &
printf ready > "$ready"
while true; do sleep 1; done
"""
    environment = {**os.environ, "PYTHONPATH": str(Path(credentials.__file__).parent)}
    process = subprocess.Popen(
        [
            sys.executable,
            "-c",
            driver,
            str(Path(credentials.__file__).parent),
            str(tmp_path),
            "bash",
            "-c",
            child,
            "synthetic-release",
            str(ready),
            str(cleaned),
        ],
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        deadline = time.monotonic() + 5
        while not ready.exists() and process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.02)
        assert ready.exists(), process.communicate(timeout=1)
        process.send_signal(interruption)
        stdout, stderr = process.communicate(timeout=5)
        assert process.returncode != 0, (stdout, stderr)
        assert cleaned.read_text() == "restored"
        assert list((tmp_path / "cache").iterdir()) == []
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=2)
