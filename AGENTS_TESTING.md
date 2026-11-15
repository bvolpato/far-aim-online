# Testing

Run full production validation from repo root:

```bash
./test.sh
```

Coverage includes shared-data sync and release integrity, Python lint/tests, shell syntax,
web lint, Vitest unit tests, TypeScript type check, production build, Playwright E2E tests,
Android lint/unit tests, Android debug build, and minified release app bundle build.

For focused web work:

```bash
cd web
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

For crawler-only work:

```bash
cd scripts
uv run pytest
```

Mobile GitHub Actions:
- Android workflow runs lint, bundled-data/runtime unit tests, `assembleDebug`, and minified `bundleRelease` on relevant pushes and pull requests.
- Public iOS CI pins stable Xcode 27.2 (27B52) and iOS SDK 27.2 on the GitHub-hosted `xcode-27` image. It runs unit and reader UI tests on iPhone 18 Pro, iPhone Duo, and iPad Pro 11-inch (M5) with iOS 27.2, then builds an unsigned device app. Missing required simulators fail explicitly. Linux `./test.sh` does not validate iOS.
- The `iOS TestFlight archive` workflow requires successful iPhone, Duo, and iPad jobs for the exact source commit, reruns unit and reader UI tests on iPhone 18 Pro, and archives an unsigned device app with Xcode 27.2. It starts from a pushed `testflight-ios-<build>` tag or a manual run. The workflow includes the current shared FAR/AIM data and emits archive provenance, signing entitlements, and dSYMs. It has no signing or App Store Connect secrets.
- The previous iOS credentials remain quarantined. Do not use `./scripts/package-ios.sh` for signing while its private manifest marks iOS quarantined. To distribute the unsigned native archive, use a separately issued local distribution certificate and the matching FAR/AIM App Store profile with the pinned BruTV signing and upload helpers described in `MOBILE_RELEASE.md`.
- Android screenshot jobs run only through manual workflow dispatch.

For Linux iOS development, `./mobile/ios/build-linux.sh build release` compiles
the app with xtool and the real Apple SDK. `./mobile/ios/limulator.sh test` runs
the reader and fold scenarios in an existing native iOS guest. Follow
[mobile/ios/LINUX.md](mobile/ios/LINUX.md) for configuration, commands, and result
limits. These checks are separate from `./test.sh` and native XCTest.

For focused native reader checks on a Mac with Xcode 27.2 and the Duo simulator:

```bash
./scripts/sync-data.sh ios
xcodebuild test -project mobile/ios/FARAIMPro.xcodeproj -scheme FARAIMPro \
  -destination 'platform=iOS Simulator,name=iPhone Duo,OS=27.2' \
  -only-testing:FARAIMProUITests/ReaderExperienceTests \
  -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO
```

The UI suite checks search handoff and empty results, collapse during search,
unsaved note continuity through rotation and tab changes, and reader text scaling
and controls at an accessibility text size. CI uploads `.xcresult` bundles with
the accessibility-size screenshot. Rotation tests do not establish folding behavior.

Before a Duo release, use Xcode Device Hub to move between Closed, Partially Open,
and Open while a reader, unsaved note, and quiz are active. Confirm that each task
survives without resetting, and that text, tables, controls, and vertical native
bars respect the asymmetric safe areas. Repeat in landscape and iPad Split View,
with light/dark appearance and accessibility text sizes. Use the documented Device
Hub controls; the workflow does not assume an undocumented simulator fold command.
