# FAR/AIM Online

[![Web CI](https://github.com/bvolpato/far-aim-online/actions/workflows/web-ci.yml/badge.svg)](https://github.com/bvolpato/far-aim-online/actions/workflows/web-ci.yml)
[![Android Build](https://github.com/bvolpato/far-aim-online/actions/workflows/android-build.yml/badge.svg)](https://github.com/bvolpato/far-aim-online/actions/workflows/android-build.yml)
[![iOS CI](https://github.com/bvolpato/far-aim-online/actions/workflows/ios-ci.yml/badge.svg)](https://github.com/bvolpato/far-aim-online/actions/workflows/ios-ci.yml)
[![Source Freshness](https://github.com/bvolpato/far-aim-online/actions/workflows/source-freshness.yml/badge.svg)](https://github.com/bvolpato/far-aim-online/actions/workflows/source-freshness.yml)

**The essential reference guide and study companion for pilots learning Federal Aviation Regulations and the Aeronautical Information Manual.**

Website: [faraim.online](https://faraim.online)

FAR/AIM Online is free to use on the web, iOS, and Android. There is no account,
subscription, or in-app purchase requirement.

This is an independent project. [Source and content notices](THIRD_PARTY_NOTICES.md)
explain the MIT license scope, upstream sources, and content excluded from offline
bundles while third-party rights are unresolved. See [contributing](CONTRIBUTING.md)
for source and attribution requirements.

## Features

- **FAR Browser** - Browse eCFR sections, appendices, and 591 official figures
- **AIM Reader** - Study 11 core chapters, appendices, tables, and 212 figures
- **Pilot/Controller Glossary** - Complete FAA terminology with cross-reference links
- **Practice Quizzes** - Test your knowledge with chapter/part-specific quizzes
- **Flashcards** - Learn definitions and concepts with interactive flashcards
- **Full-Text Search** - TF-IDF ranked search across available reference and study content with highlighting
- **Reading History** - Remembers your last position in FAR and AIM
- **Dark Mode** - Full dark mode support across all pages
- **Native Offline Support** - iOS and Android bundle reference and study content

## Platforms

| Platform | Technology | Requirements |
|----------|------------|--------------|
| **Web** | React 19, TypeScript, Vite, Tailwind CSS | Node.js 22+, pnpm 11 |
| **iOS** | SwiftUI | Xcode 26+, iOS 17.0+ |
| **Android** | Kotlin, Jetpack Compose | JDK 17, Android SDK 36+, Min SDK 26 |

All platforms support:
- Continue Reading banners (remembers where you left off)
- Grouped quizzes/flashcards by AIM chapters and FAR parts
- Sections expanded by default for easier navigation
- Reference links in quiz explanations (e.g., "AIM 10-2-4" links to the right section)

## Project Structure

```
far-aim-online/
├── data/                    # Shared data (FAR, AIM, quizzes, flashcards)
│   ├── far/                 # Federal Aviation Regulations (from eCFR)
│   │   ├── index.json       # FAR parts index
│   │   ├── pilot-index.json # Pilot-relevant parts subset
│   │   └── part*.json       # Individual regulation parts
│   ├── aim/                 # Aeronautical Information Manual
│   │   ├── index.json       # AIM chapters index
│   │   ├── chapter*.json    # Individual chapters (1-11)
│   │   ├── pcg.json         # Pilot/Controller Glossary
│   │   └── images/          # AIM figures and diagrams
│   ├── advisory-circulars/  # FAA AC metadata, official links, and available extracted text
│   ├── quizzes/             # Quiz questions by chapter/part
│   └── flashcards/          # Flashcard decks by chapter/part
├── web/                     # React web frontend
│   ├── src/
│   │   ├── components/      # Reusable React components
│   │   ├── pages/           # Page components (FAR, AIM, Quiz, etc.)
│   │   ├── context/         # Theme context and hooks
│   │   └── data/            # Data loading utilities
│   └── public/              # Static assets and search indexes
├── mobile/
│   ├── ios/                 # iOS app (SwiftUI)
│   │   └── FARAIMPro/
│   └── android/             # Android app (Kotlin/Compose)
│       └── app/
├── scripts/                 # Data crawling and processing scripts
│   ├── crawl_far.py         # FAR crawler (from eCFR)
│   ├── crawl_aim.py         # AIM crawler (official FAA HTML)
│   ├── crawl_pcg.py         # Pilot/Controller Glossary crawler
│   ├── update_advisory_circulars.py # Current FAA AC metadata crawler
│   ├── crawl_advisory_circulars.py  # AC PDF text/OCR extractor
│   ├── clean_data.py        # Data cleaning and encoding fixes
│   ├── generate_study_materials.py  # Quiz/flashcard generation
│   ├── build_inverted_index.js      # Search index builder
│   ├── sync-data.sh         # Mobile data sync script
│   └── pyproject.toml       # Python dependencies (use uv)
└── .github/
    └── workflows/           # Public web, Android, iOS, data, and security CI
```

## Content Included

### FAR Parts
All 213 indexed Title 14 parts plus key Title 49 references, with 6,531 sections,
181 appendices, and 591 official eCFR figures. Pilot-focused references include:
- **Part 1** - Definitions and Abbreviations
- **Part 43** - Maintenance, Preventive Maintenance, Rebuilding, and Alteration
- **Part 61** - Certification: Pilots, Flight Instructors, and Ground Instructors
- **Part 67** - Medical Standards and Certification
- **Part 71** - Designation of Class A, B, C, D, and E Airspace Areas
- **Part 73** - Special Use Airspace
- **Part 91** - General Operating and Flight Rules
- **Part 97** - Standard Instrument Procedures
- **Part 119** - Certification: Air Carriers and Commercial Operators
- **Part 135** - Operating Requirements: Commuter and On Demand Operations
- **49 CFR 830** - NTSB Accident/Incident Reporting

### AIM Chapters
All 11 core AIM chapters, plus Explanation of Changes and Appendices 1-5:
- **General Information** - Explanation of Changes and AIM Appendices 1-5
- **Chapter 1** - Air Navigation
- **Chapter 2** - Aeronautical Lighting and Other Airport Visual Aids
- **Chapter 3** - Airspace
- **Chapter 4** - Air Traffic Control
- **Chapter 5** - Air Traffic Procedures
- **Chapter 6** - Emergency Procedures
- **Chapter 7** - Safety of Flight
- **Chapter 8** - Medical Facts for Pilots
- **Chapter 9** - Aeronautical Charts and Related Publications
- **Chapter 10** - Helicopter Operations
- **Chapter 11** - Other AIM Information (UAS)

### Study Materials
- **AIM Quizzes** - 11 chapter/topic quizzes with sourced explanations
- **FAR Quizzes** - Quizzes for key parts (61, 91, 67, 43, 830)
- **Specialty Quizzes** - Airspace requirements, private pilot FAR
- **Flashcard Decks** - Chapter and part-specific flashcards (17 decks)

## Development

### Web

```bash
cd web
pnpm install
pnpm dev          # Start dev server on http://localhost:3000
pnpm build        # Build for production
pnpm lint         # Run ESLint
pnpm test         # Run Vitest tests
```

### iOS

Open `mobile/ios/FARAIMPro.xcodeproj` in Xcode and build.

Requirements:
- Xcode 26+ with iOS 26 SDK for App Store packaging
- iOS 17.0+ deployment target

Before building, sync data from the shared directory:
```bash
./scripts/sync-data.sh ios
```

### Android

```bash
# Sync data first
./scripts/sync-data.sh android

# Build
cd mobile/android
./gradlew assembleDebug
```

Requirements:
- Android Studio or JDK 17
- Android SDK 36+
- Min SDK 26

### Data Scripts (Python)

The crawlers use `uv` for dependency management:

```bash
cd scripts

# Install dependencies with uv
uv sync

# Run FAR crawler (fetches from eCFR)
uv run python crawl_far.py 2>&1 | tee far-crawl.log

# Run AIM crawler (fetches official FAA HTML)
uv run python crawl_aim.py 2>&1 | tee aim-crawl.log

# Run Glossary crawler
uv run python crawl_pcg.py 2>&1 | tee pcg-crawl.log

# Refresh current AC metadata and extract searchable PDF text
uv run python update_advisory_circulars.py
uv run python crawl_advisory_circulars.py

# Install optional OCR support for scanned legacy ACs
uv sync --extra ocr
uv run python crawl_advisory_circulars.py --ocr --refresh

# Clean and fix data
uv run python clean_data.py

# Generate study materials
uv run python generate_study_materials.py

# Build search indexes (requires Node.js)
node build_inverted_index.js
```

The `FAA Advisory Circular Content Update PR` workflow checks the FAA catalog
Wednesdays at 14:31 UTC, audits every current document page for replaced PDF URLs
on the first of each month at 15:47 UTC, and
can be run manually. It opens or updates
`automation/faa-ac-content-refresh` only when source-backed data changes.
Generated commits and PR bodies identify workflow file, generator revision, run
URL, trigger, and actor. Review generated PRs before merge; workflow never
auto-merges them. It dispatches web, scripts, Android, security, and
source-freshness validation, waits for every run, and publishes linked results
as native `Generated AC validation` check on each generated commit. Generated
Android validation skips Play Store screenshots. New or changed records
re-resolve their official PDF URLs and refresh extracted text. Monthly audits
also hash a rotating, bounded PDF shard to detect same-URL replacements.
Catalog requests retry transient timeouts, connection errors, and retryable HTTP
responses up to four attempts, with a 15-second connect timeout, a 120-second
read timeout, and capped backoff. Permanent errors and mismatched export/list
contents stop the refresh before publication.
Merging a content PR into `main` triggers Web CI and publishes the website after
the web checks pass.

### Data Sync for Mobile

Mobile apps use the same JSON data as web but need it copied to platform-specific directories:

```bash
# Sync to both platforms
./scripts/sync-data.sh all

# Sync to specific platform
./scripts/sync-data.sh ios
./scripts/sync-data.sh android

# Clean synced data
./scripts/sync-data.sh clean
```

**Note:** Synced mobile data directories are gitignored. CI/CD workflows automatically sync data before building.

## Architecture

### Data-Driven Design
- **Single Source of Truth** - All content stored in JSON files under `/data/`
- **Static Data** - Content bundled with apps for offline use and zero backend costs
- **Build-Time Processing** - Search indexes and mobile data sync happen at build time

### Search Strategy
- **Inverted Index** - Pre-computed TF-IDF indexes for fast client-side search
- **Split Indexes** - Separate files per category (`inverted-index-far.json`, `inverted-index-aim.json`)
- **Lazy Loading** - Indexes fetched only when search is engaged
- **Debouncing** - 300ms input debounce to prevent UI freezing

### Content Delivery
- **Code Splitting** - Dynamic imports for FAR Parts and AIM Chapters
- **On-Demand Fetching** - Detailed content fetched on navigation
- **Progressive Disclosure** - Hierarchical navigation (Parts → Subparts → Sections)

## Deployment

### Web
Every push to `main`, including merged AC refresh PRs, runs Web CI and deploys to
https://faraim.online after lint, production dependency audit, unit tests, build,
and browser tests pass. The deploy job downloads that run's tested artifact and
publishes it to `gs://faraim.online`; it does not rebuild. Deployment jobs run one
at a time without cancellation, and skip commits superseded before deployment
starts. PRs and manually dispatched feature-branch checks cannot deploy.

Google Cloud authentication uses GitHub OIDC and the dedicated
`far-aim-online-web-deploy` service account. Its trust requires this repository's
numeric ID, `main` branch, and web deployment workflow, with access limited to the
website bucket. There are no stored service-account keys. To inspect or provision
the identity and GitHub variables
using an authorized local Google Cloud account:

```bash
./scripts/configure-web-deploy.sh
GH_CONFIG_DIR="$HOME/.config/gh-personal" ./scripts/configure-web-deploy.sh --apply
```

The script sets `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and
`GCP_DEPLOY_SERVICE_ACCOUNT`. It uses the dedicated `far-aim-online-github` identity pool;
the bucket's public-read access and website configuration are provisioned separately.

Each release includes `release.json` with its commit and entry script. The deploy
job verifies this metadata, representative pages, and immutable script caching
over HTTPS. HTML may remain at an edge for up to five minutes; verification uses
a release-specific query to check the newly published content. To retry the
current release, manually dispatch Web CI on `main`. For a local build and deploy,
run `./deploy.sh`. `./deploy.sh --skip-tests --skip-build` publishes an existing
`web/dist` and is intended for already validated artifacts.

### iOS
Public iOS CI runs simulator tests and an unsigned device build on a GitHub-hosted
Mac. Signed packaging uses `./scripts/package-ios.sh` on a Mac after tests pass
and replacement private signing credentials are available.

### Android
Run `./scripts/package-android.sh` with a reviewed private GCS manifest generation,
then verify its signed AAB before a separate Google Play submission. See
[MOBILE_RELEASE.md](MOBILE_RELEASE.md) for private storage and release commands.
Manually dispatch the
Android workflow when Play Store screenshots are needed.

## CI/CD

GitHub Actions workflows:
- **Web CI** - Validate relevant PRs and every main-branch push; deploy tested main releases
- **Official Aviation Reference Refresh PR** - Daily AC catalog checks, weekly FAR/AIM/PCG refreshes, and monthly PDF audits with reviewable content PRs
- **iOS CI** - Simulator XCTest and unsigned device builds on GitHub-hosted macOS
- **Android Build** - Build APK + capture phone/tablet screenshots

PR validation uses GitHub-hosted runners and read-only tokens without signing
credentials. Scheduled source refreshes open reviewable PRs; daily freshness
checks verify the official sources. Fork contributions are welcome.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for review and validation steps. Every
content change needs an authoritative source and edition/date. Do not add
third-party copyrighted material unless its redistribution rights are documented.

## License

The [MIT License](LICENSE) applies only to project-authored code, documentation,
and original study materials, to the extent the project has rights to license
them. It does not relicense government-source content, third-party material,
or dependencies. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[`data/README.md`](data/README.md) for source attribution and known exclusions.

Regulation data comes from the eCFR, maintained by the Office of the Federal
Register at the National Archives with the Government Publishing Office. AIM,
the Pilot/Controller Glossary, and Advisory Circular publications come from the
FAA. Government works and material credited to other rights holders retain
their applicable legal status and notices; they are not project-owned content.

## Disclaimer

FAR/AIM Online is an independent study and reference aid. It is not affiliated
with or endorsed by the FAA or U.S. Department of Transportation, and it is not
a substitute for official current regulations, FAA publications, flight
planning, or operational judgment. Content can be incomplete or out of date.
Verify current official sources before relying on it, especially for flight
operations.
