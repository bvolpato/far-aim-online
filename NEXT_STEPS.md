# FAR/AIM Pro Next Steps

Store-console status below was last verified on 2026-09-27. It is historical, not a current store-health check. Release tooling and content notes were updated on 2026-10-17:

- Web deployed: `https://faraim.online`
- Legal pages live: `https://faraim.online/privacy`, `https://faraim.online/terms`
- Store metadata tracked in `store/android/metadata/` and `store/ios/metadata/`
- Store screenshots tracked in `store/android/screenshots/` and `store/ios/screenshots/`
- Current content includes 213 FAR parts with 6,546 sections, 185 appendices and 592 figures,
  11 core AIM chapters plus change notes and 5 appendices with 283 figures,
  1,557 glossary terms, and 779 current Advisory Circulars.
- Web, Android, and iOS include 731 complete and 42 partial searchable AC text
  extractions. FAA lists AC 8260-32F as current but its content is unavailable. Offline text for 5 additional ACs is omitted pending third-party republication review; their official FAA links remain available.
- Native FAR/AIM readers include bundled figures and structured tables.
- Android phone/tablet store screenshots were refreshed from the release candidate
  by Android Build action run `34438382172` on 2026-09-10. The iOS phone/tablet
  baseline is from 2026-07-09 and still needs a release-candidate refresh.
- Website content and visual refresh are deployed at `https://faraim.online`.
- Sales model (updated 2026-09-23): free website and free mobile apps, with no
  subscription or in-app purchases.
- Android signing inputs are fetched from isolated private GCS storage. See `MOBILE_RELEASE.md`.
- Android bundled-data unit tests validate FAR, AIM, glossary, Advisory Circular, quiz, and flashcard assets.
- Public iOS CI runs simulator XCTest and an unsigned device build on GitHub-hosted macOS.
- Current signed Android outputs:
  - `mobile/android/app/build/outputs/apk/release/app-release.apk`
  - `mobile/android/app/build/outputs/bundle/release/app-release.aab`
- Private signing files are not stored in this public repository or its CI secrets.

## Release Blockers

- [x] Upload signed AAB to Play Console and confirm Google accepts the upload certificate (version code 3, verified 2026-09-24).
- [x] Keep signing inputs in isolated private GCS storage with generation-pinned local fetches.
- [x] Create Apple App Store distribution profile for `com.faraimpro.ios`.
- [ ] Revoke previously exposed Apple Distribution certificate, then create a
  replacement certificate and FAR/AIM Pro provisioning profile.
- [x] Quarantine previously exposed iOS inputs in private storage.
- [ ] Add replacement iOS inputs and a password file to private GCS, then approve a new manifest generation.
- [x] Decide sales model: free website and free mobile apps. No app billing code is needed for launch.

## Web

- [x] Deploy existing website.
- [x] Deploy content and visual refresh.
- [x] Add footer links for Privacy Policy and Terms of Service.
- [x] Add `/privacy` and `/terms` routes.
- [x] Include legal routes in sitemap.
- [x] Smoke test live legal links (verified 2026-09-10):

```bash
curl -I -L https://faraim.online/privacy
curl -I -L https://faraim.online/terms
```

- [x] Deploy and verify the updated free-access copy, privacy policy, and Android App Links certificate (2026-09-27). The live `assetlinks.json` includes the upload and Play App Signing certificates.

## Android Release

- [x] Create Play Console app with package name `com.faraimpro.app`.
- [x] Enable Play App Signing (verified 2026-09-24).
- [x] Add Play App Signing fingerprint to `web/public/.well-known/assetlinks.json`.
  The website was published and the live certificate verified on 2026-09-27.
- [ ] Evaluate separating the existing shared Android upload key during a future rotation.
- [x] Retrieve signing files outside the repository through the verified private helper.

- [x] Validate signed Play release build:

```bash
./scripts/package-android.sh
```

- [x] Upload generated AAB (version code 3, target SDK 36, 16 KB page size supported):

```text
mobile/android/app/build/outputs/bundle/release/*.aab
```

- [x] Submit Play Store listing text from `store/android/metadata/en-US/` in Console; the Free copy is pending review.
- [x] Refresh Play Store screenshots from Android Build action run `34438382172`
  (verified 2026-09-10).
- [x] Verify phone, 7-inch, and 10-inch Play Store screenshot sets are present in Console.
- [x] Verify Data safety declaration is actioned in Console.
- [x] Set Android app pricing to Free in Play Console (verified 2026-09-24).
- [x] Verify the United States closed testing country, content rating, target audience, ads declaration, and app access in Console.
- [x] Submit version 1.1.0 (3) and Free listing copy for Play review (2026-09-27). Automated quick checks passed and Publishing overview confirms the changes are in review.
- [ ] Confirm Google approves version 1.1.0 (3) and makes it available to closed Alpha testers.
- [ ] Recruit at least 12 testers who opt in continuously for 14 days, then apply for production access. Console showed 0 opted-in testers on 2026-09-27.
- [x] Test the signed version 1.1.0 (3) on Android 16 phone and tablet emulators (2026-09-27): offline FAR/AIM browsing, search, system-bar insets, and the Privacy Policy row passed.

## iOS Release

- [ ] Create App Store Connect app for bundle ID `com.faraimpro.ios`.
- [ ] Replace previously exposed Apple Distribution certificate before upload.
- [ ] Create a new App Store provisioning profile for `com.faraimpro.ios` using
  replacement certificate.
- [ ] Build signed IPA on macOS with Xcode:

```bash
export IOS_TEAM_ID="<Apple developer team>"
export IOS_PROFILE_NAME="<matching App Store profile>"
export IOS_BUILD_NUMBER="<unused App Store Connect build number>"
export RELEASE_CREDENTIALS_MANIFEST_GENERATION="<reviewed private manifest generation>"
./scripts/package-ios.sh
```

This command syncs data and runs XCTest before archive/export.

- [ ] Upload generated IPA:

```text
mobile/ios/build/release/export/*.ipa
```

- [ ] Upload App Store listing text from `store/ios/metadata/en-US/`.
- [ ] Refresh and upload App Store screenshots from `store/ios/screenshots/`.
- [ ] Complete App Privacy answers, export compliance, age rating, and review notes.
- [ ] Verify the Free price reported by the owner in App Store Connect, then choose territories,
  support URL, marketing URL, privacy URL, and terms URL.
- [ ] Test via TestFlight, then submit for App Review.

## Verification Before Submission

- [x] Web (lint, unit tests, build, and E2E verified 2026-09-27):

```bash
cd web
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

- [ ] Android unsigned QA:

```bash
./scripts/package-android.sh --unsigned
```

- [x] Android signed release build with real keystore (verified 2026-09-24):

```bash
./scripts/package-android.sh
```

- [ ] iOS simulator build and signed IPA export on macOS:

```bash
./scripts/package-ios.sh
```

- [ ] Install Android release APK on a physical device and verify:
  - FAR browsing
  - AIM browsing
  - Search
  - Advisory Circulars
  - Flashcards
  - Quizzes
  - Offline launch
- [ ] Install iOS TestFlight build on a physical device and verify same flows.

## Store Submission Notes

- Signing inputs remain in the isolated private GCS project. See `MOBILE_RELEASE.md`.
- Public workflows test unsigned builds and have no signing-storage access.
- Do not commit passwords, private keys, profiles, or credential manifests.
- Keep screenshots and metadata in git as source of truth.
- Use `store/PUBLISHING.md` as store-console checklist and source of exact values.
- Use privacy URL `https://faraim.online/privacy`.
- Use terms URL `https://faraim.online/terms`.
- Keep FAA attribution and unofficial-reference positioning in listing copy and legal pages.
- Set both store listings to Free. The current launch has no paid download,
  subscription, or in-app purchase flow.
