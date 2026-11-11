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
- Public iOS CI runs simulator XCTest and an unsigned device build on a GitHub-hosted `macos-26` runner. Linux `./test.sh` does not validate iOS.
- The `iOS TestFlight archive` workflow runs XCTest and archives an unsigned device app with Xcode 27.2. It starts from a pushed `testflight-ios-<build>` tag, or a manual run after the workflow is registered on the default branch. The workflow includes the current shared FAR/AIM data and emits archive provenance, signing entitlements, and dSYMs. It has no signing or App Store Connect secrets.
- The previous iOS credentials remain quarantined. Do not use `./scripts/package-ios.sh` for signing while its private manifest marks iOS quarantined. To distribute the unsigned native archive, use a separately issued local distribution certificate and the matching FAR/AIM App Store profile with the pinned BruTV signing and upload helpers described in `MOBILE_RELEASE.md`.
- Android screenshot jobs run only through manual workflow dispatch.
