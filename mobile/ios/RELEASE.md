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

The `iOS TestFlight archive` workflow uses Xcode 27.2 and iOS 27.2. It syncs the
shared data, runs the `FARAIMProTests` XCTest target on an iPhone simulator, and
archives an unsigned device build. The artifact includes the `.xcarchive`,
dSYMs, the target's signing entitlements, and a provenance file with its source
commit and Apple SDK details. No certificate, password, or App Store Connect key
is available to the workflow.

Select an unused build number and push a signed release tag from a reviewed
commit. GitHub Actions runs the same archive workflow on a native Apple runner:

```sh
git tag -s testflight-ios-12 REVIEWED_SOURCE_SHA -m 'iOS TestFlight build 12'
git push origin refs/tags/testflight-ios-12
GH_CONFIG_DIR="$HOME/.config/gh-personal" gh run list --workflow ios-testflight.yml
```

The manual `build_number` input is available after this workflow is added to the
default branch. Find the successful tag run and download its
`ios-native-archive-<build>` artifact:

```sh
GH_CONFIG_DIR="$HOME/.config/gh-personal" gh run list \
  --workflow ios-testflight.yml --limit 10 \
  --json databaseId,headSha,headBranch,status,conclusion
GH_CONFIG_DIR="$HOME/.config/gh-personal" gh run download RUN_ID \
  --name ios-native-archive-12 --dir mobile/ios/build/native-12/download
unzip mobile/ios/build/native-12/download/ios-native-archive.zip \
  -d mobile/ios/build/native-12
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

Use the shared signing helpers from the reviewed, pinned BruTV commit. Check out
that source revision outside the FAR/AIM repository and install its Linux
signing tool:

```sh
git clone --filter=blob:none --no-checkout https://github.com/bvolpato/brutv.git \
  "$HOME/.cache/brutv-release"
git -C "$HOME/.cache/brutv-release" fetch --depth=1 origin \
  1f67eff147f52fd43efbbaad3aaf83d096bc7f34
git -C "$HOME/.cache/brutv-release" checkout --detach \
  1f67eff147f52fd43efbbaad3aaf83d096bc7f34
export BRUTV_IOS="$HOME/.cache/brutv-release/mobile/ios/BruTV"
"$BRUTV_IOS/setup-linux.sh" --signing-tools
```

Set `IOS_CERTIFICATE_PATH`, `IOS_P12_PASSWORD`,
`IOS_PROVISIONING_PROFILE_PATH`, `IOS_TEAM_ID`, `IOS_BUNDLE_ID`, and
`IOS_APP_STORE_ID` in the ignored local `.env`. For FAR/AIM, use bundle
`com.faraimpro.ios`, App Store Connect app ID `6765584356`, and the new
FAR/AIM-specific App Store profile issued for the new certificate. Set
`IOS_ENTITLEMENTS_PATH` to the `signing-entitlements.plist` downloaded with the
archive. Keep the App Store Connect `.p8` key outside this repository and
reference it from that `.env`.

The archive uses Xcode's native resources and remains unsigned in GitHub. Sign
and upload it on the Linux release host with the matching profile and certificate:

```sh
IOS_RELEASE_DIR="$PWD/mobile/ios/build/native-12/signed" \
IOS_ENTITLEMENTS_PATH="$PWD/mobile/ios/build/native-12/native-ios-release/signing-entitlements.plist" \
IOS_BUILD_NUMBER=12 IOS_BUNDLE_ID=com.faraimpro.ios \
IOS_APP_STORE_ID=6765584356 \
uv run --env-file .env -- "$BRUTV_IOS/release.sh" \
  --platform ios \
  --app "$PWD/mobile/ios/build/native-12/native-ios-release/Application.xcarchive/Products/Applications/FARAIMPro.app" \
  --upload --testflight-group Testers \
  --whats-new 'Check current FAR and AIM references, search, study marks, and offline launch.' \
  --tester tester@example.com
```

Replace the example tester address only when inviting a named tester. Add one
`--tester` option for each requested invite; existing group members retain
access when the option is omitted. The helper verifies Apple processing, app
ownership, internal group membership, and TestFlight availability. Complete
export compliance and test installation on iPhone and iPad; archive and upload
success do not establish device installation or app behavior.

For native local signing with Xcode on a Mac, the app's existing `release.sh`
still requires the private helper's ready credential generation. The new local
Linux signing path does not update or bypass that private GCS quarantine gate.

Output:

- Native CI archive: `Application.xcarchive`, dSYMs, `signing-entitlements.plist`,
  and `provenance.json` in the downloaded release artifact.
- Locally signed package: `mobile/ios/build/native-<build>/signed/export/BruTV.ipa`
  (the IPA contains FAR/AIM Pro, as verified from its bundle identifier).

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
