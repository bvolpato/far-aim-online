#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'
export CI="${CI:-true}"

SKIP_TESTS=false
SKIP_BUILD=false
DEPLOY_TARGET="web"
GCS_BUCKET="${GCS_BUCKET:-gs://faraim.online}"
GCLOUD_ACCOUNT="${GCLOUD_ACCOUNT:-${CLOUDSDK_CORE_ACCOUNT:-}}"
GCLOUD_CONFIG="${GCLOUD_CONFIG:-${CLOUDSDK_ACTIVE_CONFIG_NAME:-}}"

usage() {
    cat <<'EOF'
Deploy FAR/AIM Pro.

Web deploy builds static pages, uploads compressed assets, then publishes route entrypoints.
iOS and Android targets currently select mobile deploy branches.

Usage:
  ./deploy.sh [options]

Options:
  --account=EMAIL Specify gcloud account for deploy without changing default.
  --config=NAME   Specify gcloud configuration name for deploy.
  --skip-tests    Skip ./test.sh before deploying.
  --skip-build    Deploy existing web/dist without rebuilding (use with --skip-tests).
  --ios           Select iOS target.
  --android       Select Android target.
  -h, --help      Show this help.

Environment:
  GCS_BUCKET      Web deploy bucket. Default: gs://faraim.online.
  GCLOUD_ACCOUNT  Web deploy gcloud account.
  GCLOUD_CONFIG   Web deploy gcloud configuration name.

Available sessions:
  ./deploy.sh     Test and deploy web/mobile target.
  ./test.sh       Run Python, lint, unit, type, build, Playwright install, and E2E checks.
EOF
}

for arg in "$@"; do
    case "$arg" in
        --account=*)
            GCLOUD_ACCOUNT="${arg#*=}"
            ;;
        --config=*)
            GCLOUD_CONFIG="${arg#*=}"
            ;;
        --skip-tests)
            SKIP_TESTS=true
            ;;
        --skip-build)
            SKIP_BUILD=true
            ;;
        --ios)
            DEPLOY_TARGET="ios"
            ;;
        --android)
            DEPLOY_TARGET="android"
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown argument:${NC} $arg"
            usage
            exit 2
            ;;
    esac
done

if [ "$SKIP_BUILD" = true ] && { [ "$DEPLOY_TARGET" != web ] || [ "$SKIP_TESTS" != true ]; }; then
    echo -e "${RED}--skip-build requires the web target and --skip-tests.${NC}" >&2
    exit 2
fi

if [ -n "$GCLOUD_ACCOUNT" ]; then
    export CLOUDSDK_CORE_ACCOUNT="$GCLOUD_ACCOUNT"
fi
if [ -n "$GCLOUD_CONFIG" ]; then
    export CLOUDSDK_ACTIVE_CONFIG_NAME="$GCLOUD_CONFIG"
fi

echo "FAR/AIM Pro deploy"
echo "=================="
echo "Target: $DEPLOY_TARGET"
if [ -n "$GCLOUD_ACCOUNT" ]; then
    echo "Account: $GCLOUD_ACCOUNT"
fi
if [ -n "$GCLOUD_CONFIG" ]; then
    echo "Configuration: $GCLOUD_CONFIG"
fi

if [ "$SKIP_TESTS" = false ]; then
    "$ROOT_DIR/test.sh"
else
    echo -e "${YELLOW}Skipping tests (--skip-tests)${NC}"
fi

case "$DEPLOY_TARGET" in
    web)
        echo ""
        if [ "$SKIP_BUILD" = false ]; then
            echo "Building web"
            (cd "$ROOT_DIR/web" && pnpm build)
        else
            echo "Deploying prebuilt web/dist (--skip-build)"
        fi

        node - "$ROOT_DIR/web/dist" <<'NODE'
const fs = require('fs');
const path = require('path');
const dist = process.argv[2];
function isNonemptyFile(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 0;
}
for (const name of ['index.html', '404.html', 'robots.txt', 'sitemap.xml']) {
  if (!isNonemptyFile(path.join(dist, name))) throw new Error(`Missing or empty web/dist/${name}; deploy did not run.`);
}
for (const name of ['assets', 'search']) {
  const directory = path.join(dist, name);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()
    || !fs.readdirSync(directory, { recursive: true }).some(file => isNonemptyFile(path.join(directory, file)))) {
    throw new Error(`Missing or empty web/dist/${name}; deploy did not run.`);
  }
}
NODE

        echo "Collecting web routes"
        ROUTE_LIST="$(mktemp)"
        ROUTE_DIR="$(mktemp -d)"
        IMMUTABLE_DIR="$(mktemp -d)"
        PREVIOUS_SITEMAP="$(mktemp)"
        OBSOLETE_ROUTES="$(mktemp)"
        GCS_ERROR="$(mktemp)"
        CACHE_METADATA="$(mktemp)"
        CACHE_UPDATES="$(mktemp)"
        trap 'rm -f "$ROUTE_LIST" "$PREVIOUS_SITEMAP" "$OBSOLETE_ROUTES" "$GCS_ERROR" "$CACHE_METADATA" "$CACHE_UPDATES"; rm -rf "$ROUTE_DIR" "$IMMUTABLE_DIR"' EXIT

        if ! command -v gcloud >/dev/null 2>&1; then
            echo -e "${RED}gcloud not found. Web build is ready at web/dist, but deploy did not run.${NC}"
            exit 1
        fi

        gcs_object_exists() {
            if gcloud storage objects describe "$1" --format=none --verbosity=error 2>"$GCS_ERROR"; then
                return 0
            fi
            local error_text
            local missing_url
            error_text="$(cat "$GCS_ERROR")"
            if [[ "$error_text" == "ERROR: (gcloud.storage.objects.describe) "*" not found: 404." ]]; then
                missing_url="${error_text#ERROR: (gcloud.storage.objects.describe) }"
                missing_url="${missing_url% not found: 404.}"
                missing_url="${missing_url//%2F//}"
                missing_url="${missing_url//%2f//}"
                if [ "$missing_url" = "$1" ]; then
                    return 1
                fi
            fi
            printf '%s\n' "$error_text" >&2
            exit 1
        }

        set_cache_control_if_needed() {
            local cache_control="$1"
            shift
            gcloud storage objects list "$@" --raw \
                --format='json(bucket,name,cacheControl,timeDeleted)' >"$CACHE_METADATA"
            node - "$CACHE_METADATA" "$CACHE_UPDATES" "$cache_control" <<'NODE'
const fs = require('fs');
const [metadataFile, updatesFile, cacheControl] = process.argv.slice(2);
const objects = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
const urls = [...new Set(objects
  .filter((object) => !object.timeDeleted && object.cacheControl !== cacheControl)
  .filter((object) => !cacheControl.includes('immutable') || !/\.html$/i.test(object.name))
  .map((object) => `gs://${object.bucket}/${object.name}`))];
fs.writeFileSync(updatesFile, urls.join('\n') + (urls.length ? '\n' : ''));
NODE
            if [ -s "$CACHE_UPDATES" ]; then
                gcloud storage objects update --read-paths-from-stdin \
                    --cache-control="$cache_control" <"$CACHE_UPDATES"
            fi
        }

        if gcs_object_exists "$GCS_BUCKET/sitemap.xml"; then
            gcloud storage cat "$GCS_BUCKET/sitemap.xml" >"$PREVIOUS_SITEMAP"
        fi

        ROOT_DIR="$ROOT_DIR" ROUTE_LIST="$ROUTE_LIST" \
            PREVIOUS_SITEMAP="$PREVIOUS_SITEMAP" OBSOLETE_ROUTES="$OBSOLETE_ROUTES" node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.env.ROOT_DIR || process.cwd();
const distDir = path.join(root, 'web', 'dist');
const indexFile = path.join(distDir, 'index.html');
const sitemapFile = path.join(distDir, 'sitemap.xml');
const routeListFile = process.env.ROUTE_LIST;

if (!fs.existsSync(indexFile) || !fs.existsSync(sitemapFile) || !routeListFile) {
  throw new Error('The web build is missing its index, sitemap, or route-list destination.');
}

function sitemapRoutes(sitemap) {
  if (!sitemap.includes('<urlset') || !sitemap.includes('</urlset>')) {
    throw new Error('Invalid sitemap; refusing to change deployed routes.');
  }
  const routes = Array.from(new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => {
      const url = new URL(match[1]);
      return decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '');
    })
    .filter((route) => route && !path.extname(route))))
    .sort();
  for (const route of routes) {
    if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(route)) {
      throw new Error(`Invalid route path: ${route}`);
    }
  }
  return routes;
}

const previousSitemap = fs.readFileSync(process.env.PREVIOUS_SITEMAP, 'utf8');
const previousRoutes = previousSitemap ? sitemapRoutes(previousSitemap) : [];
const renderedRoutes = fs.readdirSync(distDir, { recursive: true })
  .filter((name) => name.endsWith('/index.html'))
  .map((name) => name.slice(0, -'/index.html'.length));
const routes = [...new Set([
  ...sitemapRoutes(fs.readFileSync(sitemapFile, 'utf8')),
  ...renderedRoutes,
])].sort();
for (const route of routes) {
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(route)) {
    throw new Error(`Invalid route path: ${route}`);
  }
}
const currentRoutes = new Set(routes);
const obsoleteRoutes = previousRoutes.filter((route) => !currentRoutes.has(route));

fs.writeFileSync(routeListFile, routes.join('\n') + (routes.length ? '\n' : ''));
fs.writeFileSync(process.env.OBSOLETE_ROUTES, obsoleteRoutes.join('\n') + (obsoleteRoutes.length ? '\n' : ''));

console.log(`Found ${routes.length} web routes and ${obsoleteRoutes.length} obsolete routes`);
NODE

        echo "Uploading immutable assets before entrypoints"
        # Search data shares a directory with its rendered HTML entrypoint.
        node - "$ROOT_DIR/web/dist" "$IMMUTABLE_DIR" <<'NODE'
const fs = require('fs');
const path = require('path');
const [dist, staging] = process.argv.slice(2);
for (const directory of ['assets', 'search']) {
  fs.cpSync(path.join(dist, directory), path.join(staging, directory), {
    recursive: true,
    filter: (source) => !/\.html$/i.test(source),
  });
}
NODE
        for asset_dir in assets search; do
            if [ -d "$IMMUTABLE_DIR/$asset_dir" ]; then
                gcloud storage cp --cache-control="public,max-age=31536000,immutable" \
                    --no-clobber --recursive --gzip-local=js,css,json,svg \
                    "$IMMUTABLE_DIR/$asset_dir" "$GCS_BUCKET/"
                # Remove gzip upload's no-transform so the edge can negotiate Brotli.
                set_cache_control_if_needed "public,max-age=31536000,immutable" \
                    "$GCS_BUCKET/$asset_dir/**"
            fi
        done

        echo "Syncing static files and rendered pages"
        # Retain previous hashes for visitors with an older page open.
        # gcloud treats a leading ^ as a custom list delimiter, not a regex anchor.
        gcloud storage rsync --cache-control="public,max-age=0,s-maxage=300,must-revalidate" \
            --recursive --exclude='(?:assets/|search/(?!.*\.html$)|(?:index|spa|404)\.html$|sitemap\.xml$)' \
            "$ROOT_DIR/web/dist" "$GCS_BUCKET"
        set_cache_control_if_needed "public,max-age=0,must-revalidate" "$GCS_BUCKET/robots.txt"
        set_cache_control_if_needed "public,max-age=0,must-revalidate" "$GCS_BUCKET/sw.js"
        set_cache_control_if_needed "public,max-age=0,must-revalidate" "$GCS_BUCKET/manifest.webmanifest"

        HTML_OBJECTS=("$GCS_BUCKET/index.html")
        if [ -s "$ROUTE_LIST" ]; then
            echo "Uploading route entrypoints"
            while IFS= read -r route; do
                IFS='/' read -r -a route_segments <<< "$route"
                ROUTE_LAYER="$ROUTE_DIR/${#route_segments[@]}"
                mkdir -p "$ROUTE_LAYER/$(dirname "$route")"
                route_source="$ROOT_DIR/web/dist/$route/index.html"
                if [ ! -f "$route_source" ]; then
                    route_source="$ROOT_DIR/web/dist/404.html"
                fi
                cp "$route_source" "$ROUTE_LAYER/$route"
                HTML_OBJECTS+=("$GCS_BUCKET/$route")
            done < "$ROUTE_LIST"
            for route_layer in "$ROUTE_DIR"/*; do
                gcloud storage cp \
                    --content-type="text/html; charset=utf-8" \
                    --cache-control="public,max-age=0,s-maxage=300,must-revalidate" \
                    --gzip-local-all --recursive "$route_layer"/* "$GCS_BUCKET"
            done
        fi

        gcloud storage cp --cache-control="public,max-age=0,s-maxage=300,must-revalidate" \
            --content-type="text/html; charset=utf-8" --gzip-local=html \
            "$ROOT_DIR/web/dist/index.html" "$GCS_BUCKET/index.html"
        gcloud storage cp --cache-control="no-cache" \
            --content-type="text/html; charset=utf-8" --gzip-local=html \
            "$ROOT_DIR/web/dist/404.html" "$GCS_BUCKET/404.html"
        set_cache_control_if_needed "public,max-age=0,s-maxage=300,must-revalidate" \
            "${HTML_OBJECTS[@]}" "$GCS_BUCKET/**/index.html"
        set_cache_control_if_needed "no-cache" "$GCS_BUCKET/404.html"

        if [ -s "$OBSOLETE_ROUTES" ]; then
            echo "Removing obsolete route entrypoints"
            while IFS= read -r route; do
                for object in "$GCS_BUCKET/$route" "$GCS_BUCKET/$route/index.html"; do
                    if gcs_object_exists "$object"; then
                        gcloud storage rm "$object"
                    fi
                done
            done < "$OBSOLETE_ROUTES"
        fi

        # Keep the previous route inventory until cleanup succeeds so retries can finish it.
        gcloud storage cp --cache-control="public,max-age=0,must-revalidate" \
            "$ROOT_DIR/web/dist/sitemap.xml" "$GCS_BUCKET/sitemap.xml"
        ;;

    ios)
        "$ROOT_DIR/scripts/sync-data.sh" ios
        (cd "$ROOT_DIR/mobile/ios" && xcrun agvtool bump)
        (cd "$ROOT_DIR/mobile/ios" && xcodebuild -scheme FARAIMPro -configuration Release)
        ;;

    android)
        "$ROOT_DIR/scripts/sync-data.sh" android
        (cd "$ROOT_DIR/mobile/android" && ./gradlew bundleRelease)
        ;;
esac

echo -e "${GREEN}Deploy complete${NC}"
