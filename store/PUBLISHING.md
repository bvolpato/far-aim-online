# FAR/AIM Pro Publishing Checklist

Use this file while filling Play Console and App Store Connect.

## Product Identity

- App name: `FAR/AIM Pro`
- Sales model: `Free app`
- Launch price: `Free`
- Website: `https://faraim.online`
- Privacy Policy: `https://faraim.online/privacy`
- Terms of Service: `https://faraim.online/terms`

## Android

- Package name: `com.faraimpro.app`
- Release upload file: `mobile/android/app/build/outputs/bundle/release/app-release.aab`
- Optional proof APK: `mobile/android/app/build/outputs/apk/release/app-release.apk`
- Listing text folder: `store/android/metadata/en-US/`
- Screenshot folder: `store/android/screenshots/`
- Screenshot baseline: phone, 7-inch tablet, and 10-inch tablet sets captured
  from commit `a1e07a6` by Android Build action run `34438382172` on 2026-09-10
- App icon: `store/android/assets/app-icon-play-512.png`
- Feature graphic: `store/android/assets/feature-graphic-1024x500.png`

Before upload, run `./scripts/package-android.sh` with local upload-key files or
signing environment variables. CI `bundleRelease` validates minification and
packaging but does not prove Play upload signing; do not upload its unsigned AAB.

### Play Console entries

- App name: `FAR/AIM Pro`
- Short description: from `store/android/metadata/en-US/short_description.txt`
- Full description: from `store/android/metadata/en-US/full_description.txt`
- Privacy Policy URL: `https://faraim.online/privacy`

### Data safety

Current app behavior:

- No account creation
- No backend user database
- No analytics SDK
- No ads SDK
- No personal data sold or shared
- Study state, reading history, theme settings, quiz progress, search history, saved references, highlights, and notes stay on device unless the user exports a study pack
- Normal content browsing works offline after install
- Android manifest declares no network permissions

Use `store/android/metadata/en-US/data_safety.md` as source.

### Play Console status

Once offered free of charge, a Google Play app [cannot become a paid download](https://support.google.com/googleplay/android-developer/answer/6334373). Charging for the download later would require a new app and package name.

App pricing is set to Free in Play Console. The United States closed testing track is active. Content rating, target audience, ads, app access, Data safety, privacy policy, and Play App Signing declarations are actioned. The phone and tablet screenshot sets are present.

Play accepted signed version 1.1.0 (3) with target SDK 36 and 16 KB page size support, verified again in App bundle explorer on 2026-09-27. The release and updated Free listing copy were submitted on 2026-09-27. Automated quick checks passed and Publishing overview confirms the changes are in review. Managed publishing is off, so an approved release can become available to closed Alpha testers automatically. Google reported warnings for the larger download (85.9 MB versus 77.8 MB) and missing native debug symbols; neither blocked the upload.

Production access remains gated by at least 12 testers opted in continuously for 14 days, followed by Google's production-access approval. Console showed 0 opted-in testers on 2026-09-27. The original signed version 1.1.0 (3) passed Android 16 phone and tablet smoke checks for offline FAR/AIM browsing, search, system-bar insets, and the Privacy Policy row. The updated website privacy policy and `assetlinks.json` were deployed and verified live on 2026-09-27; the asset links file includes the Play signing certificate.

## iOS

- Bundle ID: `com.faraimpro.ios`
- Apple Team ID: `83BXSDT7QC`
- Provisioning profile name: `FAR/AIM Pro App Store Distribution`
- Release upload file: `mobile/ios/build/release/export/*.ipa`
- Listing text folder: `store/ios/metadata/en-US/`
- Screenshot folder: `store/ios/screenshots/`
- Screenshot baseline: iPhone and iPad sets captured 2026-07-09

### App Store Connect entries

- Name: `FAR/AIM Pro`
- Subtitle: from `store/ios/metadata/en-US/subtitle.txt`
- Description: from `store/ios/metadata/en-US/description.txt`
- Keywords: from `store/ios/metadata/en-US/keywords.txt`
- Promotional text: from `store/ios/metadata/en-US/promotional_text.txt`
- Support URL: `https://faraim.online/support`
- Marketing URL: `https://faraim.online`
- Privacy Policy URL: `https://faraim.online/privacy`
- Terms of Service URL: `https://faraim.online/terms`
- Copyright: from `store/ios/metadata/en-US/copyright.txt`
- Review notes: from `store/ios/metadata/en-US/review_notes.txt`

### App Privacy / review answers

Current app behavior:

- No account
- No user-generated content
- No in-app purchases or subscriptions
- No ads
- No third-party analytics SDK
- FAR, AIM, Advisory Circular, quiz, flashcard, and glossary content bundled in app
- Study progress and preferences stored locally on device

### Remaining App Store Connect work

- Revoke exposed Apple Distribution certificate, issue replacement certificate/profile, and update ignored local signing files
- Verify the owner's report that the price is Free in App Store Connect
- Choose territories
- Complete App Privacy questionnaire
- Complete age rating
- Complete export compliance
- Upload TestFlight build
- Submit for review

## Source Files To Keep Updated

- Android listing copy: `store/android/metadata/en-US/`
- iOS listing copy: `store/ios/metadata/en-US/`
- Android screenshots: `store/android/screenshots/`
- iOS screenshots: `store/ios/screenshots/`
- Release checklist: `NEXT_STEPS.md`
- Packaging notes: `MOBILE_RELEASE.md`
