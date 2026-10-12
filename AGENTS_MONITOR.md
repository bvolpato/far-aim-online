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

## Android release

In Play Console, verify the uploaded bundle's target SDK and page-size support. Confirm
Publishing overview and the selected track show the expected version, review status, and
rollout state. A closed-test release is not a production release. Check Dashboard for the
current tester count and production-access eligibility.

Verify `https://faraim.online/privacy` renders the current policy and
`https://faraim.online/.well-known/assetlinks.json` includes the Play App Signing certificate.
Use an Android 16 device or emulator to check offline browsing, search, system-bar insets,
and the in-app privacy link on phone and tablet layouts.
