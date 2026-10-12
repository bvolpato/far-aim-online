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
- Run `./scripts/package-ios.sh` with Xcode 26+ and iOS 26 SDK on Mac to test, archive, and export locally.
- Android screenshot jobs run only through manual workflow dispatch.
