# Deploy

Deploy web from repo root:

```bash
./deploy.sh
```

When full tests already passed in same workflow:

```bash
./deploy.sh --skip-tests
```

Default web target builds `web/dist` with static HTML for home, FAR/AIM references,
quizzes, and flashcard decks.
It uploads content-hashed assets and search shards first, using gzip for text files
and one-year immutable caching. Previous hashed objects are retained so existing
tabs keep working. Route entrypoints use their rendered HTML when available and
the generic `404.html` app shell otherwise. HTML uses browser revalidation and a
five-minute shared-cache lifetime. The fallback error page is not cached.

After publishing new pages, the deploy compares the previous bucket sitemap with
the current routes and removes obsolete route objects and their `index.html`
copies. Routes still rendered in the build are preserved even if absent from the
sitemap. The new sitemap is published last so an interrupted cleanup can be
retried. Missing objects are accepted; other storage errors stop the deploy.
Hashed assets and legacy search indexes remain available for older open tabs.

The deploy removes gzip upload's `no-transform` directive so Cloudflare can
negotiate Brotli or gzip. It syncs to `gs://faraim.online` with `gcloud storage` and
configures the bucket website main page to `index.html` and error page to
`404.html`. Override the bucket with:

```bash
GCS_BUCKET=gs://bucket-name ./deploy.sh --skip-tests
```

Cloudflare must explicitly cache HTML and JSON, which are not cached by default.
Inspect the proposed site rule, then apply it when configuring the production zone:

```bash
node scripts/configure-web-cache.mjs
node scripts/configure-web-cache.mjs --apply
```

Provide `CLOUDFLARE_API_TOKEN` with zone read, cache-rule edit, and zone-settings
edit access, or the
existing `CLOUDFLARE_EMAIL` and `CLOUDFLARE_API_KEY` credentials. The script only
manages its named rule in the `faraim.online` zone and preserves other rules.
It respects origin cache lifetimes, including `no-cache` and `private` responses.
It also disables Email Address Obfuscation, which rewrites reference text and
breaks React hydration of the prerendered pages.
After a deploy, an already cached HTML response can remain for up to five minutes.

## Android

The app targets Android 16 (API 36). Use an authenticated maintainer user and a
reviewed private GCS manifest generation, then build:

```bash
export RELEASE_CREDENTIALS_MANIFEST_GENERATION="<reviewed private manifest generation>"
./scripts/package-android.sh
jarsigner -verify mobile/android/app/build/outputs/bundle/release/app-release.aab
```

Upload the signed AAB to the existing `com.faraimpro.app` listing in Play Console with an
unused version code. Confirm target SDK 36 or higher, page-size support, supported devices,
and release validation before saving. Publish any privacy-policy or app-link changes the
release requires, then submit the saved release and listing changes from Publishing overview.

FAR/AIM Pro currently uses the closed Alpha track. Production access requires at least
12 testers opted in continuously for 14 days, followed by Google's production-access approval.
Saving a release or submitting it for review does not make it available to testers or production users.

See `MOBILE_RELEASE.md` for private credential storage and retrieval. Public CI
builds unsigned mobile artifacts and never fetches release keys. iOS CI validates
simulator tests and an unsigned device build; signed packaging and App Store
submission require Mac validation and replacement credentials. The old iOS
certificate/profile remain quarantined.
