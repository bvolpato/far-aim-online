# Mobile releases

FAR/AIM Online is free and open source. The existing store identities remain
`com.faraimpro.app` on Android and `com.faraimpro.ios` on iOS.

Public GitHub Actions validate unsigned builds. They cannot access private
signing credentials. Store submission is a separate maintainer action.

## Private signing storage

Signing inputs live in `gs://far-aim-online-release-secrets-3207647`, in the
isolated `far-aim-online-signing-3207647` GCP project. The project and bucket allow
only the maintainer's authenticated user account. Public-access prevention,
uniform bucket access, object versioning, and 30-day soft deletion are enabled.
The website deployment identity has no access to this project.

The private `release-manifest.json` identifies reviewed object generations,
sizes, and SHA256 checksums. A local release requires an exact manifest generation:

```bash
gcloud auth login
export RELEASE_CREDENTIALS_MANIFEST_GENERATION="$(gcloud storage objects describe \
  gs://far-aim-online-release-secrets-3207647/release-manifest.json \
  --format='value(generation)')"
```

Review the private manifest when rotating credentials before using its generation.
`scripts/release_credentials.py` checks the storage boundary and manifest, fetches
generation-pinned inputs into a private directory outside the repository, and
removes temporary files when the release command exits. Password files are data;
the helper never sources them as shell code. Do not commit keys, profiles,
passwords, base64 credentials, or credential manifests.

## Android

Java 17+ and Android SDK 36+ are required. Run `./test.sh` before release packaging.

```bash
./scripts/package-android.sh --unsigned
./scripts/package-android.sh
jarsigner -verify mobile/android/app/build/outputs/bundle/release/app-release.aab
```

The signed command fetches the existing upload key and signing properties through
the private helper. Outputs are under `mobile/android/app/build/outputs/`.
Upload the signed AAB only after verifying it and choosing an unused Play version
code. Google Play retains the app-signing key through Play App Signing.

## iOS

The public `iOS CI` workflow runs XCTest on a simulator and builds an unsigned
device app on a GitHub-hosted Mac. A signed App Store archive also requires a Mac,
Xcode 26+, and the iOS 26+ SDK.

The previous distribution certificate and profile are quarantined in private
storage. The helper refuses to use them. Revoke the previously exposed
certificate and issue a replacement certificate and matching profile. Store
the replacement P12, profile, and password file privately under `ios/`, then
publish a new generation-pinned private manifest with the iOS state `ready`.

After simulator tests pass and replacement credentials are available:

```bash
export IOS_TEAM_ID="<Apple developer team>"
export IOS_PROFILE_NAME="<matching App Store profile>"
export IOS_BUILD_NUMBER="<unused App Store build number>"
./scripts/package-ios.sh
```

The helper supplies certificate, profile, and password file paths. Signed IPA
output is under `mobile/ios/build/release/export/`. A passing unsigned CI build
does not validate signing, TestFlight installation, or App Store acceptance.
