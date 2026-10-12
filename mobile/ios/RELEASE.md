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

## Local macOS Build

Requires Xcode 26 or later with iOS 26 SDK. iOS GitHub Actions are disabled;
release validation and packaging run on maintainer Mac.

```bash
export IOS_TEAM_ID="83BXSDT7QC"
export IOS_PROFILE_NAME="FAR/AIM Pro App Store Distribution"
export IOS_P12_PASSWORD="..."
export IOS_BUILD_NUMBER="8" # use an unused App Store Connect build number
./scripts/package-ios.sh
```

Normal packaging syncs data, runs XCTest on an iOS simulator, then creates the
signed archive. Use `--skip-simulator-build` only when tests already passed.

Output:

- `mobile/ios/build/release/export/*.ipa`

## Submission Checklist

- Upload signed IPA to TestFlight.
- Install TestFlight build on iPhone and iPad; smoke test search, readers, study marks, and offline launch.
- Fill App Store metadata from `store/ios/metadata/en-US/`.
- Upload iPhone and iPad screenshots.
- Set price to Free.
- Complete App Privacy questionnaire.
- Complete age rating.
- Complete export compliance.
- Submit for review.
