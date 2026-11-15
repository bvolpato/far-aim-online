# iOS App Store Release

Use this path to produce the App Store upload artifact for FAR/AIM Pro.

## App Store Connect

- App name: `FAR/AIM Pro`
- Bundle ID: `com.faraimpro.ios`
- Team ID: `83BXSDT7QC`
- SKU: `faraimpro-ios-001`
- Category: `Education`
- Price: `Free`
- Privacy Policy: `https://faraim.online/privacy`
- Terms: `https://faraim.online/terms`

Listing copy is in `store/ios/metadata/en-US/`.
Screenshots are in `store/ios/screenshots/`.

## Native CI Archive

The `iOS TestFlight archive` workflow uses Xcode 27.2 (27B52) and SDK 27.2. It
requires successful iPhone, Duo, and iPad CI jobs for the exact source commit.
CI selects each device's compatible iOS 27.2 runtime, including Duo's separate
runtime. The archive workflow syncs shared data, reruns `FARAIMProTests` and
`FARAIMProUITests/ReaderExperienceTests` on iPhone 18 Pro, and archives an unsigned
device build. The artifact includes the `.xcarchive`,
dSYMs, the target's signing entitlements, and a provenance file with its source
commit and Apple SDK details. No certificate, password, or App Store Connect key
is available to the workflow.

Select an unused build number and push a signed release tag from a reviewed
commit. GitHub Actions runs the same archive workflow on a native Apple runner:

```sh
git tag -s testflight-ios-13 REVIEWED_SOURCE_SHA -m 'iOS TestFlight build 13'
git push origin refs/tags/testflight-ios-13
GH_CONFIG_DIR="$HOME/.config/gh-personal" gh run list --workflow ios-testflight.yml
```

Alternatively, dispatch the archive workflow after the exact commit passes CI:

```sh
GH_CONFIG_DIR="$HOME/.config/gh-personal" gh workflow run ios-testflight.yml \
  --ref main -f build_number=13
```

Choose an unused build number and confirm the run's `headSha` is the reviewed
commit. Dispatch and tag push create an unsigned artifact; neither uploads to
Apple. Find the successful run and download its
`ios-native-archive-<build>` artifact (these examples use build 13):

```sh
GH_CONFIG_DIR="$HOME/.config/gh-personal" gh run list \
  --workflow ios-testflight.yml --limit 10 \
  --json databaseId,headSha,headBranch,status,conclusion
GH_CONFIG_DIR="$HOME/.config/gh-personal" gh run download RUN_ID \
  --name ios-native-archive-13 --dir mobile/ios/build/native-13/download
unzip mobile/ios/build/native-13/download/ios-native-archive.zip \
  -d mobile/ios/build/native-13
```

Verify `native-ios-release/provenance.json` matches the reviewed source commit,
bundle identifier, version, build number, and successful run before signing.

## Local signing and TestFlight

The historical FAR/AIM iOS signing set remains quarantined in its private GCS
manifest. `scripts/package-ios.sh` still refuses to use it. The newly issued
local Apple Distribution certificate has a separate FAR/AIM App Store profile.
Set the matching profile path before signing. Keep the P12, profile, and
passwords outside Git, with passwords and local paths in an ignored `.env`. Do not change the GCS
manifest's quarantine state or copy the new private key into CI.

`release-linux.py` extracts the reviewed BruTV helpers from commit
`1f67eff147f52fd43efbbaad3aaf83d096bc7f34` into a temporary directory. It never
executes the helper checkout's working files. Use an existing BruTV repository
containing that commit, or fetch it outside the FAR/AIM checkout:

```sh
git clone --filter=blob:none --no-checkout https://github.com/bvolpato/brutv.git \
  "$HOME/.cache/brutv-release"
git -C "$HOME/.cache/brutv-release" fetch --depth=1 origin \
  1f67eff147f52fd43efbbaad3aaf83d096bc7f34
```

Set `IOS_CERTIFICATE_PATH`, `IOS_P12_PASSWORD`,
`IOS_PROVISIONING_PROFILE_PATH`, `IOS_TEAM_ID`, and `IOS_ZSIGN` in the ignored
local `.env`. `IOS_ZSIGN` must point to an executable Linux zsign installation;
the prepared BruTV Linux toolchain supplies one. Use absolute credential paths
and a FAR/AIM-specific App Store profile for the same certificate and team.
For upload, also set `IOS_ASC_KEY_ID`, `IOS_ASC_ISSUER_ID`, and
`IOS_ASC_PRIVATE_KEY_PATH`. Keep the `.p8` key outside this repository. The
wrapper fixes the bundle ID to `com.faraimpro.ios` and app ID to `6765584356`,
and takes the build number and entitlements from the native archive.

The wrapper requires the expected source SHA and verifies archive provenance,
SDK, app identity, device platform, executable, symbols, and entitlements before
the pinned helpers check signing credentials. Run a preflight without signing
or uploading:

```sh
uv run --env-file .env mobile/ios/release-linux.py \
  --release-dir mobile/ios/build/native-13/native-ios-release \
  --source-sha REVIEWED_40_CHARACTER_SOURCE_SHA \
  --helper-repo "$HOME/.cache/brutv-release" \
  --output-dir mobile/ios/build/native-13/signed --preflight
```

Remove `--preflight` to sign and validate the IPA locally. To check upload
credentials as well, combine `--preflight --upload`; preflight still performs
no upload. For an explicitly authorized upload, use a fresh output directory
and add `--upload --testflight-group Testers` and optional
`--whats-new 'Reader and offline reference checks.'`. The wrapper does not
invite testers. The pinned helper waits for Apple processing and checks app
ownership, group assignment, and TestFlight availability. A successful upload
does not establish installation or app behavior.

The release input is the native Xcode archive, with Apple's compiled resources
and dSYMs. The unsigned xtool app in [LINUX.md](LINUX.md) is for local guest
development; the release wrapper deliberately does not accept it as an archive.

For native local signing with Xcode on a Mac, the app's existing `release.sh`
requires stable Xcode 27.2 (27B52), iOS SDK 27.2, and the private helper's ready
credential generation. It defaults to the iPhone Duo simulator on iOS 27.2.
Complete the manual fold checks in `AGENTS_TESTING.md` before a Duo release.
The new local
Linux signing path does not update or bypass that private GCS quarantine gate.

### Export compliance

The native target links only Apple platform frameworks. It reads bundled
references, stores local study marks, exchanges JSON study packs through the
system file picker, and opens external HTTPS references with SwiftUI `Link`.
It includes no third-party cryptographic dependency or custom cryptography.
Following [Apple's encryption declaration guidance](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations),
`FARAIMPro/Info.plist` declares `ITSAppUsesNonExemptEncryption=false` for this
use of Apple operating-system services. Review the declaration when adding
cryptographic features or dependencies.

Build 12 was uploaded before this key was present. Apple processed it as
`VALID` but held TestFlight availability at `MISSING_EXPORT_COMPLIANCE`.
Complete its encryption declaration in App Store Connect, then resume assignment
to `Testers`. The existing build's metadata can be completed without rebuilding
or uploading another binary solely for this declaration.

Output:

- Native CI archive: `Application.xcarchive`, dSYMs, `signing-entitlements.plist`,
  and `provenance.json` in the downloaded release artifact.
- Locally signed package: `mobile/ios/build/native-<build>/signed/export/FARAIMPro.ipa`.
  Use a new output directory for each signing attempt; existing IPAs are preserved.

## Submission Checklist

- Upload signed IPA to the internal `Testers` group and verify its TestFlight state.
- Install TestFlight build on iPhone and iPad; smoke test search, readers, study marks, and offline launch.
- Fill App Store metadata from `store/ios/metadata/en-US/`.
- Upload iPhone and iPad screenshots.
- Set price to Free.
- Complete App Privacy questionnaire.
- Complete age rating.
- Complete export compliance.
- Submit for review.
