# Store Assets

Versioned source of truth for Play Store and App Store listing metadata and screenshots.

Exact store-console values live in `store/PUBLISHING.md`.

Both mobile apps are planned as free downloads with no subscription or in-app purchases.

## Signing

Signing inputs live in an isolated private GCS project and never enter this
repository or public CI. The release helper requires an authenticated owner and a
reviewed manifest generation, verifies checksums, and removes its external
temporary files after packaging. See [MOBILE_RELEASE.md](../MOBILE_RELEASE.md) for
Android packaging commands and the storage access policy.

Public Android CI builds unsigned artifacts. Public iOS CI runs simulator tests
and an unsigned device build on macOS with Xcode 26+. iOS signing remains
quarantined until the previously exposed certificate is replaced and a new
`com.faraimpro.ios` provisioning profile and P12 password are stored privately.
Store submission requires a separate release decision after platform testing.

## Screenshots

Screenshots are copied from GitHub Actions screenshot artifacts and committed here so store submissions are reproducible:

- Android: `store/android/screenshots/`
- iOS: `store/ios/screenshots/`

## Play Store Graphics

Android Play Console upload assets:

- App icon: `store/android/assets/app-icon-play-512.png`
- Feature graphic: `store/android/assets/feature-graphic-1024x500.png`
- Source SVGs: `store/android/assets/*.svg`

Current screenshot sources:

- Android: commit `1d0218a`, generated with `scripts/capture-android-screenshots.sh`
- iOS: workflow run `27095295350`, artifact `ios-app-store-screenshots`

## Legal URLs

- Privacy Policy: `https://faraim.online/privacy`
- Terms of Service: `https://faraim.online/terms`
