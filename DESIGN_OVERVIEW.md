# FAR/AIM Pro - Design Overview

This document outlines the architecture, design strategy, and requirements for the FAR/AIM Pro application.

## 1. System Overview

**Goal:** Provide fast, offline-accessible, and searchable access to Federal Aviation Regulations (FAR) and the Aeronautical Information Manual (AIM).

**Secondary Goal:** Enhance learning retention through integrated study tools (quizzes, flashcards).

**Core Philosophy:** Static Data, Native Experience. System relies on pre-processed JSON data to drive platform-optimized user interfaces without a runtime backend API.

**Reliability Standard:** "Checkride Ready." The app must be stable enough to be trusted by a student during a checkride (zero crashes, zero freezes).

## 2. Architecture & Strategy

Data-Driven Architecture: Content decoupled from presentation.

### 2.1 Strategy: Shared Static Data Model

1. **Ingest:** Scripts scrape and normalize data from official sources.
2. **Store:** Data saved as static JSON files in `/data` directory.
3. **Consume:** Web, iOS, and Android clients import/bundle these exact JSON files.

**Benefits:**
- Offline-First: Apps are self-contained (critical for cockpit use).
- Consistency: Single source of truth.
- Low Maintenance: No backend servers.

### 2.2 Data Directory Structure

```
data/
├── far/           # Federal Aviation Regulations
│   ├── index.json       # FAR parts index
│   ├── pilot-index.json # Pilot-relevant parts subset
│   └── part*.json       # Individual regulation parts
├── aim/           # Aeronautical Information Manual
│   ├── index.json       # AIM chapters index
│   ├── chapter*.json    # Individual chapters (1-11)
│   └── pcg.json         # Pilot/Controller Glossary
├── quizzes/       # Quiz JSON files
└── flashcards/    # Flashcard deck JSON files
```

### 2.3 Build-Time Data Sync for Mobile

**Problem:** Duplicating large JSON data files in both the shared `data/` directory and mobile platform assets wastes storage and causes sync issues.

**Solution:**
- Single source of truth in `data/` directory (committed to git)
- Build-time sync script (`scripts/sync-data.sh`) copies data to mobile platforms
- Mobile data directories are gitignored
- CI/CD workflows trigger sync before building

**Sync Targets:**
- iOS: `mobile/ios/FARAIMPro/Resources/data/`
- Android: `mobile/android/app/src/main/assets/`

### 2.4 Data Persistence & Sync Strategy

**Problem:** Competitor apps often wipe user data during updates or lack cross-device sync.

**Solution:**
- **Separation of Concerns:** User data (bookmarks, highlights, notes) stored in local database (SQLite/CoreData/Room), strictly separated from static content JSON.
- **Robust Migration:** When static content updates, a migration layer re-anchors user annotations to the new content structure.
- **Platform Cloud Sync:** Utilize iCloud (iOS) and Google Drive/Firebase (Android/Web) for syncing user data.

### 2.5 Search Strategy: Build-Time Inverted Index

**Problem:** Client-side searching of the entire FAR/AIM corpus (~20MB+) causes UI "jank" and slow performance.

**Solution:**
- **Pre-Computation:** Construct lightweight inverted indexes at build time mapping tokens to document IDs.
- **Split Indices:** Separate index files per category (`inverted-index-far.json`, `inverted-index-aim.json`, `inverted-index-pcg.json`).
- **TF-IDF Scoring:** Results ranked by term frequency-inverse document frequency for relevance.
- **Lazy Loading:** Indexes fetched only when search is engaged.
- **Debouncing:** Input debounced (300ms) to prevent UI freezing during rapid typing.

### 2.6 Content Delivery Strategy: Lazy Loading

**Problem:** Bundling all 1000+ sections of regulation text into the main JavaScript bundle results in massive initial download.

**Solution:**
- **Code Splitting:** Dynamic imports (`import()`) for individual FAR Parts and AIM Chapters.
- **On-Demand Fetching:** Main application loads only metadata initially; detailed content fetched on navigation.
- **Result:** Drastic reduction in initial load time and bandwidth usage.

## 3. Key Components

### 3.1 Data Ingestion Pipeline (`scripts/`)

**Stack:** Python 3, uv, BeautifulSoup, requests

**Scripts:**
- `crawl_far.py` - Scrapes FAR from eCFR
- `crawl_aim.py` - Scrapes AIM chapters and images
- `crawl_pcg.py` - Scrapes Pilot/Controller Glossary
- `clean_data.py` - Fixes encoding issues, broken words from PDF extraction
- `generate_study_materials.py` - Generates quizzes and flashcards
- `build_inverted_index.js` - Builds search indexes
- `sync-data.sh` - Syncs data to mobile platforms

**Data Quality:**
- Encoding fixes for PDF extraction artifacts (em-dashes, smart quotes)
- Broken word repair (e.g., "ELEV ATION" → "ELEVATION")
- Proper capitalization after paragraph markers

### 3.2 Shared Data Layer (`data/`)

**FAR Data:**
- Complete Title 14 and Title 49 CFR aviation regulations
- Pilot Index subset (Parts 1, 43, 61, 67, 71, 73, 91, 97, 119, 135, 830)
- Hierarchical structure: Part → Subpart → Section

**AIM Data:**
- All 11 chapters with sections and subsections
- Embedded images and figures
- Tables preserved from source

**Glossary:**
- Pilot/Controller Glossary with cross-references
- "See TERM" links for navigation between definitions

### 3.3 Study Material Generation

**Quizzes:**
- Multiple choice format (4 options)
- Scenario-based questions for operational understanding
- Explanations with source references
- Categories: AIM chapters, FAR parts, Miscellaneous
- Difficulty levels: easy, intermediate, advanced

**Flashcards:**
- Front/back card format
- Reference links to source material
- Organized by topic and chapter

### 3.4 Clients

**Web (`web/`):**
- React 18 + TypeScript
- Vite for bundling and dev server
- Tailwind CSS for styling
- React Router for navigation

**iOS (`mobile/ios/`):**
- Native SwiftUI
- Xcode project with folder references for data

**Android (`mobile/android/`):**
- Native Kotlin + Jetpack Compose
- Gradle build with data sync task

## 4. Functional Requirements

### 4.1 Content Consumption

- **Hierarchical Navigation:** Title → Part → Subpart → Section (FAR) and Chapter → Section (AIM)
- **Rich Text Rendering:** Proper indentation, tables, lists, bold/italic formatting
- **Definition Formatting:** Terms in definitions (`*Term* means...`) rendered in **bold** following regulatory convention
- **CFR Cross-References:** Section references (§ XX.XX) and Part references automatically linked
- **Deep Linking:** Support for section anchors (`/far/91#91.205`)
- **Reading History:** "Continue Reading" banner showing last viewed content
- **Chapter/Part Navigation:** Previous/Next navigation between chapters and parts

### 4.2 Pilot/Controller Glossary

- **Complete Glossary:** All FAA terms and definitions
- **Cross-Reference Links:** "See TERM" references are clickable and navigate to the target term
- **Multi-Word Terms:** Properly handles complex terms like "ADVANCED AIR MOBILITY"
- **Local Search:** Filter terms by keyword
- **Flash Highlight:** Target term flashes when navigated to via link

### 4.3 Advanced Search

- **Full-Text Search:** Searches across FAR, AIM, and glossary content
- **Content Search in Book View:** Search within chapters/parts finds matches in content, not just titles
- **TF-IDF Ranking:** Results sorted by relevance score
- **Whole Word Priority:** Whole word matches scored significantly higher than partial/substring matches (e.g., "ion" as a word ranks higher than "ion" within "submission")
- **Title Priority:** Title matches weighted higher than content matches (3x boost for whole word title matches)
- **Exact vs Prefix Matching:** Exact token matches in the index receive score boost over prefix matches
- **Contextual Snippets:** Shows matching text in context
- **Highlight on Navigation:** Search terms highlighted in yellow when viewing results
- **Hyphenated Word Support:** Properly highlights terms like "cross-country"
- **Auto-Scroll to Match:** Automatically scrolls to first matching section

### 4.4 Quiz Features

- **One-Click Answers:** Clicking an option immediately submits (no separate submit button)
- **Instant Feedback:** Shows correct/incorrect immediately with visual indicators
- **Explanations:** Detailed explanation shown after each answer
- **Reference Links:** Links to source material for further study
- **Progress Tracking:** Shows question count and completion percentage
- **Shuffled Questions:** Questions randomized for each attempt
- **Pass/Fail Result:** Clear indication of passing score achievement
- **Celebration Animation:** Airplane-themed celebration on passing score

### 4.5 Celebration Animation (Quiz Pass)

- **Airplane Effects:** Multiple airplane types (jets, propellers) fly across screen
- **Contrails:** Jet planes with trailing contrails
- **Confetti:** Colorful confetti falls from top
- **Center Burst:** Radiating rings and star burst effect
- **Achievement Badge:** "FAR/AIM Knowledge Verified" badge displayed

### 4.6 Flashcard Features

- **Card Flip Animation:** 3D flip animation between front and back
- **Progress Tracking:** Card count and completion status
- **Reference Links:** Links to source regulations

### 4.7 Quiz Categories

- **Miscellaneous:** Fun/practice quizzes (shown first)
- **AIM Quizzes:** Chapter-specific quizzes
- **FAR Quizzes:** Regulation-specific quizzes

### 4.8 Personalization & Organization (Planned)

- **Annotations:** Highlights and notes attached to specific text ranges
- **Bookmarks:** Custom titles for bookmarks
- **Organization:** Folders or tags for bookmarks
- **Cross-Device Sync:** User data syncs via platform cloud services

## 5. Non-Functional Requirements

### 5.1 Performance

- **Launch Time:** < 2 seconds to interactive
- **Navigation:** < 100ms page transitions
- **Search:** < 300ms for results with debouncing
- **Lazy Loading:** Content loaded on-demand to reduce initial bundle

### 5.2 Reliability

- **Offline Capability:** 100% functional in Airplane Mode
- **Zero Crashes:** No crashes on startup or during rendering
- **Update Safety:** User data persists through app and content updates

### 5.3 Accuracy

- **Source Fidelity:** Exact match to official FAA sources
- **Data Cleaning:** Automated fixes for PDF extraction artifacts
- **Encoding:** Proper UTF-8 handling throughout

### 5.4 Accessibility

- **Dark Mode:** Full dark mode support across all pages
- **Responsive Design:** Works on mobile, tablet, and desktop
- **Keyboard Navigation:** Accessible via keyboard

### 5.5 Build & Deployment

- **CI/CD:** GitHub Actions for web, iOS, and Android builds
- **Data Sync:** Automatic data sync in CI before mobile builds
- **Artifacts:** Build artifacts uploaded for download

## 6. Technology Stack Summary

| Component | Technology |
|-----------|------------|
| Web Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| iOS App | SwiftUI, Swift |
| Android App | Kotlin, Jetpack Compose |
| Data Scripts | Python 3, BeautifulSoup, uv |
| Search Index | Node.js (build-time) |
| CI/CD | GitHub Actions |
| Package Manager (Web) | pnpm |

## 7. File Structure

```
far-aim-online/
├── .github/workflows/     # CI/CD workflows
│   ├── android-build.yml
│   ├── ios-build.yml
│   └── web-ci.yml
├── data/                  # Shared JSON data (source of truth)
│   ├── far/
│   ├── aim/
│   ├── quizzes/
│   └── flashcards/
├── scripts/               # Data processing scripts
│   ├── crawl_*.py
│   ├── clean_data.py
│   ├── sync-data.sh
│   └── build_inverted_index.js
├── web/                   # React web application
│   ├── src/
│   │   ├── components/
│   │   ├── data/
│   │   └── pages/
│   └── public/
│       └── inverted-index-*.json
├── mobile/
│   ├── ios/              # SwiftUI iOS app
│   └── android/          # Kotlin Android app
└── DESIGN_OVERVIEW.md    # This document
```

## 8. Future Enhancements

- **Cloud Sync:** iCloud/Google Drive sync for user data
- **Annotations:** Highlight and note-taking on regulations
- **Bookmarks:** Save and organize favorite sections
- **Study Plans:** Guided study paths for different certificates
- **Offline Maps:** Integration with sectional charts
- **Push Notifications:** Regulation update alerts
