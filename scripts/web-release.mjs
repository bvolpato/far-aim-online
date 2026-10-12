#!/usr/bin/env node

import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultDistDir = join(repoRoot, 'web', 'dist');
const defaultBaseUrl = 'https://faraim.online';
const routeChecks = [
  { pathname: '/', marker: 'Find the reference.' },
  { pathname: '/far/91', marker: '14 CFR Part 91' },
  { pathname: '/aim/4', marker: 'AIM Chapter 4' },
  { pathname: '/search', marker: '<h1' },
  { pathname: '/quizzes/aim-chapter10-helicopter', marker: 'Helicopter Operations Quiz' },
  { pathname: '/flashcards/far-definitions', marker: 'Card 1 of 50' },
];

function normalizeSha(sha) {
  if (typeof sha !== 'string' || !/^[a-f\d]{40}$/i.test(sha)) {
    throw new Error('Release SHA must be exactly 40 hexadecimal characters.');
  }
  return sha.toLowerCase();
}

function validateEntry(entry) {
  if (typeof entry !== 'string' || !/^\/assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{6,}\.js$/.test(entry) || entry.includes('..')) {
    throw new Error(`Release entry must be a hashed JavaScript asset under /assets/: ${entry}`);
  }
  return entry;
}

function findEntryScript(html) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
  for (const [, attributes] of scripts) {
    const type = attributes.match(/\btype\s*=\s*(["'])(.*?)\1/i)?.[2];
    const src = attributes.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (type === 'module' && src) return validateEntry(src);
  }
  throw new Error('Built web/dist/index.html has no module entry script under /assets/.');
}

function makeRunUrl(env) {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = env;
  if (![GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID].some(Boolean)) return undefined;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) {
    throw new Error('Set GITHUB_SERVER_URL, GITHUB_REPOSITORY, and GITHUB_RUN_ID together to include the workflow run link.');
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(GITHUB_REPOSITORY) || !/^\d+$/.test(GITHUB_RUN_ID)) {
    throw new Error('GitHub repository or workflow run ID is invalid.');
  }
  const server = new URL(GITHUB_SERVER_URL);
  if (!['http:', 'https:'].includes(server.protocol)) throw new Error('GITHUB_SERVER_URL must use HTTP or HTTPS.');
  return `${server.href.replace(/\/$/, '')}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

function distPath(distDir, assetPath) {
  return join(distDir, 'assets', assetPath.slice('/assets/'.length));
}

async function readReleaseFile(distDir, expectedSha) {
  let release;
  try {
    release = JSON.parse(await readFile(join(distDir, 'release.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read web/dist/release.json: ${error.message}`);
  }
  const sha = normalizeSha(release.sha);
  if (sha !== expectedSha) {
    throw new Error(`Local release artifact SHA ${sha} does not match requested SHA ${expectedSha}.`);
  }
  const entry = validateEntry(release.entry);
  try {
    await readFile(distPath(distDir, entry));
  } catch (error) {
    throw new Error(`Local release entry ${entry} is missing or unreadable: ${error.message}`);
  }
  return { ...release, sha, entry };
}

export async function validateRelease({ sha, distDir = defaultDistDir } = {}) {
  const normalizedSha = normalizeSha(sha);
  const release = await readReleaseFile(distDir, normalizedSha);
  let html;
  try {
    html = await readFile(join(distDir, 'index.html'), 'utf8');
  } catch (error) {
    throw new Error(`Cannot read built web/dist/index.html: ${error.message}`);
  }
  const builtEntry = findEntryScript(html);
  if (builtEntry !== release.entry) {
    throw new Error(`Built index entry ${builtEntry} does not match release artifact entry ${release.entry}.`);
  }
  return release;
}

export async function stampRelease({ sha, distDir = defaultDistDir, env = process.env } = {}) {
  const normalizedSha = normalizeSha(sha);
  let html;
  try {
    html = await readFile(join(distDir, 'index.html'), 'utf8');
  } catch (error) {
    throw new Error(`Cannot read built web/dist/index.html: ${error.message}`);
  }
  const entry = findEntryScript(html);
  try {
    await readFile(distPath(distDir, entry));
  } catch (error) {
    throw new Error(`Built entry script ${entry} is missing or unreadable: ${error.message}`);
  }

  const release = { sha: normalizedSha, entry };
  const runUrl = makeRunUrl(env);
  if (runUrl) release.run_url = runUrl;

  const releasePath = join(distDir, 'release.json');
  const temporaryPath = `${releasePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(release, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, releasePath);
  return validateRelease({ sha: normalizedSha, distDir });
}

function withReleaseQuery(url, sha) {
  url.searchParams.set('release', sha);
  return url;
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs} ms.`)), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: controller.signal,
    });
    const body = await response.text();
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

function responseText({ response, body }, description) {
  if (!response.ok) throw new Error(`${description} returned HTTP ${response.status}.`);
  return body;
}

async function verifyRoute(fetchImpl, base, sha, entry, { pathname, marker }, timeoutMs) {
  const url = withReleaseQuery(new URL(pathname, base), sha);
  const result = await fetchWithTimeout(fetchImpl, url, timeoutMs);
  const html = responseText(result, `Route ${pathname}`);
  const { response } = result;
  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html/i.test(contentType)) throw new Error(`Route ${pathname} returned unexpected content type: ${contentType || '(missing)'}.`);
  if (!html.includes(`data-prerendered="${pathname}"`)) {
    throw new Error(`Route ${pathname} did not return its prerendered page.`);
  }
  if (!html.includes(marker)) throw new Error(`Route ${pathname} is missing expected page content.`);
  const routeEntry = findEntryScript(html);
  if (routeEntry !== entry) throw new Error(`Route ${pathname} references entry ${routeEntry}, expected ${entry}.`);
  if (pathname === '/search' && !/<h1\b[^>]*>\s*Search\s*<\/h1>/.test(html)) {
    throw new Error('Route /search is missing the Search page heading.');
  }
  return pathname;
}

async function verifyEntry(fetchImpl, base, sha, entry, timeoutMs) {
  const url = withReleaseQuery(new URL(entry, base), sha);
  const result = await fetchWithTimeout(fetchImpl, url, timeoutMs);
  const body = responseText(result, `Entry asset ${entry}`);
  const { response } = result;
  const contentType = response.headers.get('content-type') || '';
  if (!/(?:application|text)\/(?:javascript|ecmascript)/i.test(contentType)) {
    throw new Error(`Entry asset ${entry} returned unexpected content type: ${contentType || '(missing)'}.`);
  }
  if (!body.trim()) throw new Error(`Entry asset ${entry} is empty.`);
  const cacheControl = response.headers.get('cache-control') || '';
  if (!/(?:^|,)\s*immutable\s*(?:,|$)/i.test(cacheControl)) {
    throw new Error(`Entry asset ${entry} is missing immutable cache control.`);
  }
  return entry;
}

export async function verifyRelease({
  sha,
  distDir = defaultDistDir,
  baseUrl = defaultBaseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
} = {}) {
  const normalizedSha = normalizeSha(sha);
  const release = await validateRelease({ sha: normalizedSha, distDir });
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Base URL must use HTTP or HTTPS.');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const releaseUrl = withReleaseQuery(new URL('release.json', base), normalizedSha);
  const remoteResult = await fetchWithTimeout(fetchImpl, releaseUrl, timeoutMs);
  const remoteBody = responseText(remoteResult, 'Remote release.json');
  let remote;
  try {
    remote = JSON.parse(remoteBody);
  } catch (error) {
    throw new Error(`Remote release.json is not valid JSON: ${error.message}`);
  }
  const remoteSha = normalizeSha(remote.sha);
  const remoteEntry = validateEntry(remote.entry);
  if (remoteSha !== normalizedSha) {
    throw new Error(`Deployed SHA ${remoteSha} does not match expected SHA ${normalizedSha}.`);
  }
  if (remoteEntry !== release.entry) {
    throw new Error(`Deployed entry ${remoteEntry} does not match artifact entry ${release.entry}.`);
  }

  const routes = await Promise.all(routeChecks.map((route) => verifyRoute(fetchImpl, base, normalizedSha, release.entry, route, timeoutMs)));
  const entry = await verifyEntry(fetchImpl, base, normalizedSha, release.entry, timeoutMs);
  return { sha: normalizedSha, entry, routes };
}

async function main(argv) {
  const [command, sha, baseUrl, ...rest] = argv;
  if (rest.length || !['stamp', 'validate', 'verify'].includes(command) || !sha) {
    throw new Error('Usage: node scripts/web-release.mjs stamp <40-hex-sha> | validate <40-hex-sha> | verify <40-hex-sha> [base-url]');
  }
  if (command === 'stamp' || command === 'validate') {
    if (baseUrl) throw new Error(`The ${command} command does not accept a base URL.`);
    const release = command === 'stamp'
      ? await stampRelease({ sha })
      : await validateRelease({ sha });
    console.log(`${command === 'stamp' ? 'Stamped' : 'Validated'} ${release.sha} (${release.entry}).`);
  } else {
    const result = await verifyRelease({ sha, ...(baseUrl ? { baseUrl } : {}) });
    console.log(`Verified ${result.sha}: ${result.routes.length} prerendered routes and ${result.entry}.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
