import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { stampRelease, validateRelease, verifyRelease } from '../web-release.mjs';

const sha = 'a'.repeat(40);
const entry = '/assets/index-AbCdE123.js';
let fixtureRoot;
let distDir;

before(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'web-release-test-'));
  distDir = join(fixtureRoot, 'dist');
  await mkdir(join(distDir, 'assets'), { recursive: true });
});

after(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

async function writeArtifact({ releaseSha = sha, releaseEntry = entry } = {}) {
  await writeFile(join(distDir, 'index.html'), `<script type="module" crossorigin src="${entry}"></script>`);
  await writeFile(join(distDir, entry.slice(1)), 'export default true;');
  await writeFile(join(distDir, 'release.json'), `${JSON.stringify({ sha: releaseSha, entry: releaseEntry })}\n`);
}

async function withServer(options, callback) {
  const routes = new Map([
    ['/', '<h1>Find the reference.</h1>'],
    ['/far/91', '<title>14 CFR Part 91</title><h1>General Operating and Flight Rules</h1>'],
    ['/aim/4', '<title>AIM Chapter 4</title><h1>Air Traffic Control</h1>'],
    ['/search', '<h1>Search</h1>'],
    ['/quizzes/aim-chapter10-helicopter', '<title>Helicopter Operations Quiz | FAR/AIM Pro</title><h1>Helicopter Operations Quiz</h1>'],
    ['/flashcards/far-definitions', '<title>FAR Definitions | FAR/AIM Pro</title><h1>FAR Definitions</h1><h2>Aircraft</h2><span>Card 1 of 50</span>'],
  ]);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (options.requests) options.requests.push(url);
    if (url.pathname === '/release.json') {
      response.writeHead(options.releaseStatus ?? 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(options.remoteRelease ?? { sha, entry }));
      return;
    }
    if (url.pathname === entry) {
      response.writeHead(200, {
        'content-type': 'application/javascript',
        'cache-control': options.cacheControl ?? 'public, max-age=31536000, immutable',
      });
      response.end('export default true;');
      return;
    }
    const html = options.routeHtml?.[url.pathname] ?? routes.get(url.pathname);
    if (html) {
      response.writeHead(options.routeStatus?.[url.pathname] ?? 200, { 'content-type': 'text/html; charset=utf-8' });
      const prerenderedPath = options.prerendered?.[url.pathname] ?? url.pathname;
      response.end(`<script type="module" src="${entry}"></script><div id="root" data-prerendered="${prerenderedPath}">${html}</div>`);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
}

test('stamp records the built hashed entry and optional workflow run URL', async () => {
  await writeArtifact();
  const release = await stampRelease({
    sha,
    distDir,
    env: {
      GITHUB_SERVER_URL: 'https://github.com/',
      GITHUB_REPOSITORY: 'bvolpato/far-aim-pro',
      GITHUB_RUN_ID: '123456',
    },
  });

  assert.deepEqual(release, {
    sha,
    entry,
    run_url: 'https://github.com/bvolpato/far-aim-pro/actions/runs/123456',
  });
  assert.deepEqual(JSON.parse(await readFile(join(distDir, 'release.json'), 'utf8')), release);
});

test('local validation rejects an artifact SHA or entry that does not match the requested build', async () => {
  await writeArtifact({ releaseSha: 'b'.repeat(40) });
  await assert.rejects(validateRelease({ sha, distDir }), /does not match requested SHA/);

  await writeArtifact({ releaseEntry: '/assets/index-Wxyz9876.js' });
  await writeFile(join(distDir, 'assets/index-Wxyz9876.js'), 'export default true;');
  await assert.rejects(validateRelease({ sha, distDir }), /does not match release artifact entry/);

  await writeArtifact({ releaseEntry: '/assets/index-AbCdE123.js' });
  await rm(join(distDir, entry.slice(1)));
  await assert.rejects(validateRelease({ sha, distDir }), /missing or unreadable/);
});

test('verify checks release identity, prerendered routes, and immutable entry caching', async () => {
  await writeArtifact();
  const requests = [];
  await withServer({ requests }, async (baseUrl) => {
    const result = await verifyRelease({ sha, distDir, baseUrl });
    assert.deepEqual(result, {
      sha,
      entry,
      routes: [
        '/',
        '/far/91',
        '/aim/4',
        '/search',
        '/quizzes/aim-chapter10-helicopter',
        '/flashcards/far-definitions',
      ],
    });
  });
  assert.equal(requests.length, 8);
  assert.ok(requests.every((url) => url.searchParams.get('release') === sha));
});

test('verify rejects a wrong deployed SHA and a non-prerendered route', async () => {
  await writeArtifact();
  await withServer({ remoteRelease: { sha: 'b'.repeat(40), entry } }, async (baseUrl) => {
    await assert.rejects(verifyRelease({ sha, distDir, baseUrl }), /does not match expected SHA/);
  });

  await withServer({
    routeHtml: { '/far/91': '<h1>Find the reference.</h1>' },
    prerendered: { '/far/91': '/' },
  }, async (baseUrl) => {
    await assert.rejects(verifyRelease({ sha, distDir, baseUrl }), /Route \/far\/91 did not return its prerendered page/);
  });
});

test('verify requires study detail routes to return HTTP 200 and prerendered content', async () => {
  await writeArtifact();
  await withServer({ routeStatus: { '/quizzes/aim-chapter10-helicopter': 404 } }, async (baseUrl) => {
    await assert.rejects(
      verifyRelease({ sha, distDir, baseUrl }),
      /Route \/quizzes\/aim-chapter10-helicopter returned HTTP 404/,
    );
  });

  await withServer({ routeHtml: { '/flashcards/far-definitions': '<h1>Find the reference.</h1>' } }, async (baseUrl) => {
    await assert.rejects(
      verifyRelease({ sha, distDir, baseUrl }),
      /Route \/flashcards\/far-definitions is missing expected page content/,
    );
  });
});

test('verify rejects an entry served without immutable caching', async () => {
  await writeArtifact();
  await withServer({ cacheControl: 'public, max-age=0' }, async (baseUrl) => {
    await assert.rejects(verifyRelease({ sha, distDir, baseUrl }), /missing immutable cache control/);
  });
});
