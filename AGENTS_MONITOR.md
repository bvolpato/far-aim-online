# Monitor

After deploy, verify production from repo root:

```bash
curl -fsSL https://faraim.online/ >/tmp/faraim-home.html
curl -fsSL https://faraim.online/sitemap.xml >/tmp/faraim-sitemap.xml
curl -fsSI https://faraim.online/
curl -fsSI https://faraim.online/far/61
curl -fsSL https://faraim.online/far/61 >/tmp/faraim-far61.html
```

Expected:

- Home request succeeds with HTTP 200.
- Home HTML includes the visible heading `Find the reference.` before JavaScript.
- Sitemap request succeeds and includes `/far/61` and `/aim/1`.
- Direct reference routes, including `/far/61`, return HTTP 200 with `Content-Type: text/html` and reference text in the response body.
- Direct study routes, including `/quizzes/aim-chapter10-helicopter` and
  `/flashcards/far-definitions`, return HTTP 200 with their title and initial
  study content before JavaScript.
- Hashed `/assets/` and `/search/` files use `public,max-age=31536000,immutable`.
- HTML uses browser revalidation and a five-minute shared-cache lifetime.
- Repeated requests to the same Cloudflare edge eventually show `CF-Cache-Status: HIT`.
- Text responses negotiate compression. Inspect with `curl --compressed -I <url>`.
- Reference HTML must not contain Cloudflare `__cf_email__` substitutions, and
  browser console logs must not contain React hydration errors.
- A blank search page does not fetch search shards. A populated search fetches
  query-specific shards instead of the old full indexes and metadata files.
- Check direct reference links with JavaScript disabled, then verify hydrated
  navigation, saved reading state, quizzes, flashcards, and light/dark themes.

## Web analytics

Google Analytics account `378829560` contains property `560674423` for `faraim.online`. Its web stream is `16198187144`, measurement ID `G-VRZ5WP8Q5H`. Open [Realtime](https://analytics.google.com/analytics/web/#/p560674423/realtime/overview) to inspect incoming events. Standard reports can take 24–48 hours to populate.

The website loads the Google tag only after explicit analytics consent on the production hostname. Local development and automated browser runs do not report visits. The Analytics preferences button in the footer lets visitors change their choice. Declining, blocking the tag, or using the native apps produces no web analytics data, so GA4 is a consented-traffic count rather than a complete visitor census.

Pageviews omit URL queries and fragments, use public page categories, and do not include local study data. Google signals, advertising personalization, and all enhanced measurement are disabled. User/event retention is two months, without resetting retention on new activity. Email and search-parameter redaction are also enabled on the stream.

Use the existing service-account impersonation for read-only reports. Keep the access token in memory. Do not print it or save it to a file:

```bash
node --input-type=module <<'JS'
import { execFileSync } from 'node:child_process';
const token = execFileSync('gcloud', [
  'auth', 'print-access-token',
  '--impersonate-service-account=ownersa@lightning-202103.iam.gserviceaccount.com',
  '--scopes=https://www.googleapis.com/auth/analytics.readonly',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const response = await fetch(
  'https://analyticsdata.googleapis.com/v1beta/properties/560674423:runReport',
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
    }),
    signal: AbortSignal.timeout(20000),
  },
);
if (!response.ok) throw new Error(`Analytics report returned HTTP ${response.status}`);
console.log(JSON.stringify(await response.json(), null, 2));
JS
```

For live checks, use `:runRealtimeReport` with `activeUsers` and `eventCount` without dimensions. For an `eventName` breakdown, query `eventCount` alone because `activeUsers` is incompatible with that dimension. Label deliberate setup visits with `debug_mode` in the test event/config. Normal deploy smoke checks must stay excluded. Inspect the actual collector request to confirm sanitized page location/referrer, consent, and measurement ID, then check Realtime. Do not count setup/debug activity as organic traffic. Search Console's separate `sc-domain:faraim.online` property measures Google search clicks and impressions, including visitors who decline website analytics.

## Android release

In Play Console, verify the uploaded bundle's target SDK and page-size support. Confirm
Publishing overview and the selected track show the expected version, review status, and
rollout state. A closed-test release is not a production release. Check Dashboard for the
current tester count and production-access eligibility.

Verify `https://faraim.online/privacy` renders the current policy and
`https://faraim.online/.well-known/assetlinks.json` includes the Play App Signing certificate.
Use an Android 16 device or emulator to check offline browsing, search, system-bar insets,
and the in-app privacy link on phone and tablet layouts.
