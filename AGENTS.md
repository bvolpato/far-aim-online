# Agent Instructions for FAR/AIM Pro

This document provides guidelines for AI agents working on the FAR/AIM Pro codebase.

## Quick Reference

| Category | Requirement |
|----------|-------------|
| **Package Manager** | Always use `pnpm` (not npm) for web frontend |
| **Python Environment** | Use `uv` for script dependencies |
| **Linting** | Run `pnpm lint` after web changes |
| **Data Source** | JSON files in `/data/` are the single source of truth |

## Project Overview

FAR/AIM Pro is a multi-platform reference app for pilots studying Federal Aviation Regulations and the Aeronautical Information Manual. It consists of:

- **Web App** (`web/`) - React 19 + TypeScript + Vite + Tailwind CSS
- **iOS App** (`mobile/ios/`) - Native SwiftUI
- **Android App** (`mobile/android/`) - Kotlin + Jetpack Compose
- **Data Layer** (`data/`) - Shared JSON content files
- **Scripts** (`scripts/`) - Python crawlers and Node.js build tools

## Development Guidelines

### Web Development

```bash
cd web
pnpm install          # Install dependencies
pnpm dev              # Start dev server (port 3000)
pnpm build            # Production build
pnpm lint             # Run ESLint (REQUIRED after changes)
pnpm test             # Run Vitest tests
```

**Important:**
- Always run `pnpm lint` after making changes to catch issues early
- The lint script enforces zero warnings: `--max-warnings 0`
- Use TypeScript strict mode - avoid `any` types when possible

### Path Aliases

The web app uses path aliases defined in `vite.config.ts`:
- `@/` → `web/src/`
- `@data/` → `data/`

### Component Structure

```
web/src/
├── components/       # Reusable UI components
│   ├── AirplaneCelebration.tsx  # Quiz pass animation
│   ├── FormattedContent.tsx     # Rich text renderer
│   ├── HighlightText.tsx        # Search term highlighting
│   ├── Layout.tsx               # App shell with navigation
│   └── ThemeToggle.tsx          # Dark/light mode switch
├── context/          # React contexts
│   └── ThemeContext.tsx         # Theme state management
├── pages/            # Route components
│   ├── HomePage.tsx
│   ├── FARPage.tsx
│   ├── AIMPage.tsx
│   ├── GlossaryPage.tsx
│   ├── QuizzesPage.tsx
│   ├── QuizPage.tsx
│   ├── FlashcardsPage.tsx
│   ├── FlashcardDeckPage.tsx
│   └── SearchPage.tsx
└── data/             # Data loading utilities
    └── index.ts
```

### Data Management

All content is stored as JSON in the `/data/` directory:

```
data/
├── far/              # Federal Aviation Regulations
│   ├── index.json          # Part metadata index
│   ├── pilot-index.json    # Pilot-relevant subset
│   └── part*.json          # Individual parts (1, 43, 61, 67, 91, etc.)
├── aim/              # Aeronautical Information Manual
│   ├── index.json          # Chapter metadata index
│   ├── chapter*.json       # Chapters 1-11
│   ├── pcg.json            # Pilot/Controller Glossary
│   └── images/             # Figures and diagrams
├── quizzes/          # Quiz JSON files
└── flashcards/       # Flashcard deck JSON files
```

**Rules:**
- Never duplicate data - use the shared `/data/` directory
- Mobile apps get data via `scripts/sync-data.sh` at build time
- Update search indexes after modifying content: `node scripts/build_inverted_index.js`

### Python Scripts

Use `uv` for Python dependency management:

```bash
cd scripts
uv sync                 # Install dependencies
uv run python <script>  # Run a script
```

Available scripts:
- `crawl_far.py` - Scrape FAR from eCFR
- `crawl_aim.py` - Scrape AIM chapters
- `crawl_pcg.py` - Scrape Pilot/Controller Glossary
- `clean_data.py` - Fix encoding issues
- `generate_study_materials.py` - Generate quizzes/flashcards
- `build_inverted_index.js` - Build search indexes (Node.js)
- `sync-data.sh` - Sync data to mobile platforms

### Mobile Development

Before building mobile apps, sync the shared data:

```bash
./scripts/sync-data.sh ios      # iOS only
./scripts/sync-data.sh android  # Android only
./scripts/sync-data.sh all      # Both platforms
```

**iOS:**
- Open `mobile/ios/FARAIMPro.xcodeproj` in Xcode
- App Store packaging requires Xcode 26+, iOS 26 SDK; deployment target remains iOS 17+

**Android:**
- Build with Gradle: `cd mobile/android && ./gradlew assembleDebug`
- Requires JDK 17, Android SDK 36+

## Code Style

### TypeScript/React

- Use functional components with hooks
- Prefer named exports over default exports
- Use TypeScript interfaces for props and data types
- Follow React Router patterns for navigation

### Tailwind CSS

- Use Tailwind utility classes for styling
- Dark mode uses the `dark:` variant prefix
- Responsive design with `sm:`, `md:`, `lg:` breakpoints

### Python

- Use type hints where appropriate
- Follow PEP 8 style guide
- Ruff is configured for linting (see `pyproject.toml`)

## Testing

### Web
```bash
cd web
pnpm test             # Run Vitest tests
pnpm test -- --watch  # Watch mode
```

### Linting
```bash
cd web
pnpm lint             # Must pass with zero warnings
```

## CI/CD

GitHub Actions workflows in `.github/workflows/`:

| Workflow | Trigger | Actions |
|----------|---------|---------|
| `web-ci.yml` | Push/PR to `web/` or `data/` | Lint, build, upload artifacts |
| `ios-ci.yml` | Push/PR and manual | Xcode 26+ simulator tests and unsigned device build on GitHub-hosted macOS |
| `android-build.yml` | Push/PR to `mobile/android/` or `data/` | Build APK, capture screenshots |

**Important:** Changes to `/data/` trigger all platform builds to ensure sync.

Public pull requests use GitHub-hosted runners without signing credentials. Signed mobile releases fetch pinned inputs from the isolated private GCS signing project as documented in `MOBILE_RELEASE.md`.

## Common Tasks

### Adding a New Quiz

1. Create JSON file in `data/quizzes/` following existing format
2. Include: `id`, `title`, `description`, `questions[]`
3. Each question needs: `question`, `options[]`, `correctAnswer`, `explanation`
4. Reference source material in explanations (e.g., "See AIM 4-3-2")

### Adding a New FAR Part

1. Run the crawler with the part number
2. Add to `data/far/pilot-index.json` if pilot-relevant
3. Rebuild search index: `node scripts/build_inverted_index.js`

### Updating Search Indexes

After modifying any content in `data/`:
```bash
cd scripts
node build_inverted_index.js
```

This generates:
- `web/public/inverted-index-far.json`
- `web/public/inverted-index-aim.json`
- `web/public/inverted-index-flashcards.json`

### Syncing Data to Mobile

```bash
./scripts/sync-data.sh all
```

Copies JSON files to:
- iOS: `mobile/ios/FARAIMPro/Resources/data/`
- Android: `mobile/android/app/src/main/assets/`

## Troubleshooting

### Lint Errors
Run `pnpm lint` to see issues. Common fixes:
- Remove unused imports
- Add proper TypeScript types
- Fix React hooks dependencies

### Build Failures
1. Ensure all dependencies installed: `pnpm install`
2. Check for TypeScript errors: `pnpm build`
3. Verify data files exist in `/data/`

### Mobile Data Not Found
Run `./scripts/sync-data.sh` to copy data to mobile directories.

## Architecture Notes

### Search Implementation
- Uses pre-built inverted indexes for fast client-side search
- TF-IDF scoring with whole-word priority
- Indexes loaded lazily when search is accessed
- 300ms debounce on input to prevent jank

### Content Rendering
- `FormattedContent.tsx` handles rich text (tables, lists, bold/italic)
- `HighlightText.tsx` wraps search term highlighting
- Cross-references (§ XX.XX) are automatically linked

### Offline Support
- All content bundled as static JSON
- No runtime API calls for content
- Works in airplane mode
