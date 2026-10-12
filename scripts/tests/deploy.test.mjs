import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

const bucket = 'gs://deploy-test';
const immutable = 'public,max-age=31536000,immutable';
const htmlCache = 'public,max-age=0,s-maxage=300,must-revalidate';
const sitemap = routes => `<urlset>${routes.map(route => `<url><loc>https://faraim.online${route}</loc></url>`).join('')}</urlset>`;
const deploy = readFileSync(new URL('../../deploy.sh', import.meta.url), 'utf8');

const mockGcloud = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const stateFile = process.env.DEPLOY_TEST_STATE;
const state = JSON.parse(fs.readFileSync(stateFile));
const input = args.includes('--read-paths-from-stdin') ? fs.readFileSync(0, 'utf8') : '';
state.calls.push({ args, input });
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));
const fail = message => { save(); console.error(message); process.exit(1); };
const flag = name => args.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
const urls = args.filter(arg => arg.startsWith('gs://'));
const matches = (url, pattern) => {
  const [prefix, suffix] = pattern.split('**');
  return suffix === undefined ? url === pattern : url.startsWith(prefix) && url.endsWith(suffix);
};
if (args[0] !== 'storage') fail('Unexpected command');
if (args[1] === 'objects' && args[2] === 'describe') {
  if (state.describeError) fail(state.describeError);
  if (state.denyRead) fail('ERROR: (gcloud.storage.objects.describe) HTTPError 403: Permission denied');
  if (!state.objects[urls[0]]) {
    const displayUrl = state.encodeNotFoundPath
      ? urls[0].replace(/^(gs:\/\/[^/]+\/)(.*)$/, (_, prefix, objectPath) => prefix + objectPath.replaceAll('/', '%2F'))
      : urls[0];
    fail('ERROR: (gcloud.storage.objects.describe) ' + displayUrl + ' not found: 404.');
  }
} else if (args[1] === 'cat') {
  process.stdout.write(state.objects[urls[0]].body);
} else if (args[1] === 'objects' && args[2] === 'list') {
  if (state.failList) fail('ERROR: (gcloud.storage.objects.list) HTTPError 403: Permission denied');
  const result = Object.entries(state.objects).filter(([url]) => urls.some(pattern => matches(url, pattern))).map(([url, object]) => ({ bucket: 'deploy-test', name: url.slice('gs://deploy-test/'.length), cacheControl: object.cacheControl }));
  result.push({ bucket: 'deploy-test', name: 'assets/old.js', cacheControl: 'obsolete version', timeDeleted: '2026-01-01T00:00:00Z' });
  process.stdout.write(JSON.stringify(result));
} else if (args[1] === 'objects' && args[2] === 'update') {
  for (const url of input.trim().split('\n').filter(Boolean)) state.objects[url].cacheControl = flag('--cache-control');
} else if (args[1] === 'cp') {
  const positional = args.slice(2).filter(arg => !arg.startsWith('--'));
  const destination = positional.pop();
  const upload = (source, target) => {
    if (fs.statSync(source).isDirectory()) {
      for (const name of fs.readdirSync(source)) upload(path.join(source, name), target + '/' + name);
      return;
    }
    if (args.includes('--no-clobber') && state.objects[target]) return;
    const gzip = args.includes('--gzip-local-all') || flag('--gzip-local')?.split(',').includes(path.extname(source).slice(1));
    state.objects[target] = { body: fs.readFileSync(source, 'utf8'), cacheControl: flag('--cache-control') + (gzip ? ', no-transform' : ''), contentEncoding: gzip ? 'gzip' : undefined, contentType: flag('--content-type') };
  };
  for (const source of positional) upload(source, /^gs:\/\/[^/]+\/?$/.test(destination) ? destination.replace(/\/$/, '') + '/' + path.basename(source) : destination);
} else if (args[1] === 'rsync') {
  if (state.failRsync) fail('ERROR: (gcloud.storage.rsync) HTTPError 403: Permission denied');
  const positional = args.slice(2).filter(arg => !arg.startsWith('--'));
  // gcloud parses --exclude as ArgList before using re.match on each pattern.
  let patterns = flag('--exclude');
  let delimiter = ',';
  if (patterns.startsWith('^') && patterns.indexOf('^', 1) !== -1) {
    const separator = patterns.indexOf('^', 1);
    delimiter = patterns.slice(1, separator);
    patterns = patterns.slice(separator + 1);
  }
  const excludes = patterns.split(delimiter).map(pattern => new RegExp('^(?:' + pattern + ')'));
  for (const name of fs.readdirSync(positional[0], { recursive: true })) {
    const source = path.join(positional[0], name);
    if (fs.statSync(source).isFile() && !excludes.some(exclude => exclude.test(name))) state.objects[positional[1] + '/' + name] = { body: fs.readFileSync(source, 'utf8'), cacheControl: flag('--cache-control') };
  }
} else if (args[1] === 'rm') {
  if (state.failRemove) fail('ERROR: (gcloud.storage.rm) HTTPError 403: Permission denied');
  for (const url of urls) delete state.objects[url];
} else fail('Unexpected storage operation: ' + args.join(' '));
save();
`;

function runDeployment(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'faraim-deploy-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(root, 'deploy.sh'), deploy);
  writeFileSync(join(bin, 'gcloud'), mockGcloud, { mode: 0o755 });
  writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\necho pnpm >>"$DEPLOY_TEST_BUILD_LOG"\n', { mode: 0o755 });
  const files = {
    'index.html': 'home', '404.html': 'fallback', 'robots.txt': 'robots',
    'release.json': '{"commit":"tested-artifact"}',
    'sitemap.xml': options.invalidSitemap ? 'invalid XML' : sitemap(['/', '/far/91']),
    'far/91/index.html': 'current reference', 'updates/index.html': 'current noindex page',
    'assets/new.js': 'new code', 'assets/reused.js': 'same immutable code',
    'search/far/new.json': '{}',
  };
  if (options.withSearchHtml) files['search/index.html'] = 'current search page';
  for (const [name, body] of Object.entries(files)) {
    if (name === options.missingFile) continue;
    const file = join(root, 'web/dist', name);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, body);
  }
  if (options.emptyDirectory) {
    rmSync(join(root, 'web/dist', options.emptyDirectory), { recursive: true, force: true });
    mkdirSync(join(root, 'web/dist', options.emptyDirectory, 'empty-child'), { recursive: true });
  }
  const objects = {
    [`${bucket}/assets/old.js`]: { body: 'old code', cacheControl: immutable },
    [`${bucket}/assets/reused.js`]: { body: 'same immutable code', cacheControl: immutable },
    [`${bucket}/search/old.json`]: { body: '{}', cacheControl: immutable },
    [`${bucket}/inverted-index-far.json`]: { body: 'legacy index' },
  };
  if (!options.firstDeploy) {
    if (options.withSearchHtml) objects[`${bucket}/search/index.html`] = { body: 'previous search page', cacheControl: htmlCache };
    objects[`${bucket}/sitemap.xml`] = { body: sitemap(['/', '/far/91', '/far/999', '/aim/999']), cacheControl: 'no-cache' };
    objects[`${bucket}/far/999`] = { body: 'obsolete route' };
    objects[`${bucket}/far/999/index.html`] = { body: 'obsolete route' };
    objects[`${bucket}/aim/999`] = { body: 'obsolete route without nested copy' };
  }
  const stateFile = join(root, 'state.json');
  writeFileSync(stateFile, JSON.stringify({ objects, calls: [], ...options }));
  const buildLog = join(root, 'build.log');
  const result = spawnSync('bash', ['deploy.sh', '--skip-tests', ...(options.build ? [] : ['--skip-build'])], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GCS_BUCKET: bucket, DEPLOY_TEST_STATE: stateFile, DEPLOY_TEST_BUILD_LOG: buildLog },
  });
  return { result, state: JSON.parse(readFileSync(stateFile)), root, buildLog };
}

test('deploys the prebuilt artifact in order, repairs only changed metadata, and cleans obsolete routes', t => {
  const { result, state, root } = runDeployment(t, { withSearchHtml: true });
  assert.equal(result.status, 0, result.stderr);
  assert.throws(() => readFileSync(join(root, 'build.log')), { code: 'ENOENT' });
  assert.equal(state.objects[`${bucket}/far/91`].body, 'current reference');
  assert.equal(state.objects[`${bucket}/updates`].body, 'current noindex page');
  assert.equal(state.objects[`${bucket}/search/index.html`].body, 'current search page');
  assert.equal(state.objects[`${bucket}/search/index.html`].cacheControl, htmlCache);
  assert.equal(state.objects[`${bucket}/assets/new.js`].contentEncoding, 'gzip');
  assert.equal(state.objects[`${bucket}/assets/new.js`].cacheControl, immutable);
  assert.equal(state.objects[`${bucket}/search/far/new.json`].contentEncoding, 'gzip');
  assert.equal(state.objects[`${bucket}/search/far/new.json`].cacheControl, immutable);
  assert.equal(state.objects[`${bucket}/far/91`].contentEncoding, 'gzip');
  assert.equal(state.objects[`${bucket}/far/91`].cacheControl, htmlCache);
  assert.equal(state.objects[`${bucket}/404.html`].cacheControl, 'no-cache');
  assert.equal(state.objects[`${bucket}/assets/reused.js`].body, 'same immutable code');
  assert.equal(state.objects[`${bucket}/inverted-index-far.json`].body, 'legacy index');
  assert.equal(state.objects[`${bucket}/release.json`].body, '{"commit":"tested-artifact"}');
  assert.equal(readFileSync(join(root, 'web/dist/index.html'), 'utf8'), 'home');
  const updates = state.calls.filter(({ args }) => args[2] === 'update').flatMap(({ input }) => input.trim().split('\n'));
  assert.ok(!updates.includes(`${bucket}/assets/old.js`));
  assert.ok(!updates.includes(`${bucket}/assets/reused.js`));
  assert.ok(!updates.includes(`${bucket}/search/old.json`));
  const removed = state.calls.filter(({ args }) => args[1] === 'rm').map(({ args }) => args.at(-1));
  assert.deepEqual(removed.sort(), [`${bucket}/far/999`, `${bucket}/far/999/index.html`, `${bucket}/aim/999`].sort());
  const writes = state.calls.filter(({ args }) => ['cp', 'rsync', 'rm'].includes(args[1]));
  assert.equal(basename(writes[0].args.at(-2)), 'assets');
  assert.equal(basename(writes[1].args.at(-2)), 'search');
  assert.equal(writes.at(-1).args.at(-1), `${bucket}/sitemap.xml`);
});

test('continues cleanup when gcloud URL-encodes a missing nested route object', t => {
  const { result, state } = runDeployment(t, { encodeNotFoundPath: true });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(state.objects[`${bucket}/sitemap.xml`]);
  const removed = state.calls.filter(({ args }) => args[1] === 'rm').map(({ args }) => args.at(-1));
  assert.deepEqual(removed.sort(), [`${bucket}/far/999`, `${bucket}/far/999/index.html`, `${bucket}/aim/999`].sort());
});

for (const firstDeploy of [false, true]) {
  test(`keeps search HTML out of the immutable pass if static sync fails (${firstDeploy ? 'new' : 'existing'} page)`, t => {
    const { result, state } = runDeployment(t, { withSearchHtml: true, firstDeploy, failRsync: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /gcloud\.storage\.rsync/);
    assert.deepEqual(state.objects[`${bucket}/search/index.html`], firstDeploy
      ? undefined
      : { body: 'previous search page', cacheControl: htmlCache });
    assert.equal(state.objects[`${bucket}/search/far/new.json`].cacheControl, immutable);
    assert.equal(state.objects[`${bucket}/search/far/new.json`].contentEncoding, 'gzip');
  });
}

test('accepts an absent previous sitemap on first deployment', t => {
  const { result, state } = runDeployment(t, { firstDeploy: true });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(state.objects[`${bucket}/sitemap.xml`]);
  assert.equal(state.calls.filter(({ args }) => args[1] === 'rm').length, 0);
});

test('builds normally unless --skip-build is supplied', t => {
  const { result, buildLog } = runDeployment(t, { build: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(buildLog, 'utf8'), 'pnpm\n');
});

for (const missingFile of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'search/far/new.json']) {
  test(`rejects incomplete artifacts before storage operations: ${missingFile}`, t => {
    const { result, state } = runDeployment(t, { missingFile });
    assert.notEqual(result.status, 0);
    assert.equal(state.calls.length, 0);
  });
}

test('fails on access denial instead of treating it as a first deployment', t => {
  const { result, state } = runDeployment(t, { denyRead: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /403/);
  assert.equal(state.calls.length, 1);
});

test('rejects asset directories containing only empty subdirectories', t => {
  const { result, state } = runDeployment(t, { emptyDirectory: 'assets' });
  assert.notEqual(result.status, 0);
  assert.equal(state.calls.length, 0);
});

test('does not suppress a 404 for a different resource', t => {
  const { result, state } = runDeployment(t, {
    describeError: 'ERROR: (gcloud.storage.objects.describe) gs://different-bucket/config%2Fbad not found: 404.',
  });
  assert.notEqual(result.status, 0);
  assert.equal(state.calls.length, 1);
});

test('does not publish entrypoints after a metadata-list failure', t => {
  const { result, state } = runDeployment(t, { failList: true });
  assert.notEqual(result.status, 0);
  assert.equal(state.calls.filter(({ args }) => args[1] === 'rsync').length, 0);
  assert.ok(state.objects[`${bucket}/sitemap.xml`].body.includes('/far/999'));
});

test('retains the previous sitemap when obsolete-route cleanup fails', t => {
  const { result, state } = runDeployment(t, { failRemove: true });
  assert.notEqual(result.status, 0);
  assert.ok(state.objects[`${bucket}/sitemap.xml`].body.includes('/far/999'));
});

test('rejects a malformed sitemap before uploading', t => {
  const { result, state } = runDeployment(t, { invalidSitemap: true });
  assert.notEqual(result.status, 0);
  assert.equal(state.calls.filter(({ args }) => args[1] === 'cp' || args[1] === 'rsync').length, 0);
});
