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

### Direct APK downloads

The website also offers a signed APK at
`https://faraim.online/downloads/android/faraim-online-1.1.0-4.apk`.
The adjacent `.apk.sha256` file contains its SHA-256 checksum, and
`faraim-online-1.1.0-4.json` records the source commit, package version, size,
checksum, and signing certificate fingerprint.

Build with the private signing helper above, verify the APK signature, and test
installation before uploading to `gs://faraim.online/downloads/android/`.
Publish the APK and metadata before deploying website links. Use a new version
code and filename for each release, with immutable caching; do not replace an
existing version. APKs stay outside Git and the web build. Website deploys retain
these separately uploaded objects.

Direct APK updates are installed manually. These APKs use the upload certificate,
while Google Play uses its separate app-signing certificate. A direct APK cannot
update an installation signed by Google Play.

## iOS

The public `iOS CI` workflow runs XCTest on a simulator and builds an unsigned
device app on a GitHub-hosted Mac. The `iOS TestFlight archive` workflow uses
Xcode 27.2 to test and archive the app with native assets. A pushed signed tag
named `testflight-ios-<build>` starts the archive workflow. It uploads an unsigned
archive and symbols, but it does not sign or send any package to Apple.

The previous signing set remains quarantined. `scripts/release_credentials.py`
refuses it, and this workflow does not modify the private manifest or send signing
credentials to GitHub. A separate local signing identity and App Store profile
can be stored outside Git and configured through an ignored `.env` for the
shared Linux signing and App Store Connect helpers. The new profile must match
`com.faraimpro.ios` and the certificate used to sign the archive.

For the local process and commands, see `mobile/ios/RELEASE.md`. The direct
`./scripts/package-ios.sh` path remains disabled for signing until the private
credential manifest is deliberately reissued and reviewed. Unsigned native CI
results do not validate signing, TestFlight installation, or App Store acceptance.
