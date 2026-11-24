import { copyFile, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { build } from 'vite';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(webRoot, 'public');
const dist = join(webRoot, 'dist');
const serverDir = join(webRoot, '.cache/prerender');
const dataRoot = resolve(webRoot, '../data');

const EXCLUDED_PUBLIC_ROOT_FILES = /^(?:inverted-index|search-metadata)-.*\.json$/;

async function copyPublicAssets() {
  const pendingFiles = [];

  async function walk(sourceDir, targetDir, isRoot) {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    await mkdir(targetDir, { recursive: true });
    for (const entry of entries) {
      if (entry.name === '.gitignore') continue;
      if (isRoot && entry.isFile() && EXCLUDED_PUBLIC_ROOT_FILES.test(entry.name)) continue;
      const src = join(sourceDir, entry.name);
      const dst = join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await walk(src, dst, false);
      } else if (entry.isFile()) {
        pendingFiles.push([src, dst]);
      }
    }
  }

  await walk(publicDir, dist, true);

  const concurrency = Math.min(32, Math.max(4, availableParallelism() * 2));
  let cursor = 0;
  async function worker() {
    while (cursor < pendingFiles.length) {
      const [src, dst] = pendingFiles[cursor++];
      await copyFile(src, dst);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

await build({
  root: webRoot,
  build: {
    copyPublicDir: false,
  },
});

const template = await readFile(join(dist, 'index.html'), 'utf8');
if (!template.includes('<div id="root"></div>')) {
  throw new Error('The app template must contain an empty root element for prerendering.');
}

// Run public asset copy, template copies, and SSR bundle build concurrently.
await Promise.all([
  copyPublicAssets(),
  writeFile(join(dist, 'spa.html'), template),
  writeFile(join(dist, '404.html'), template),
  copyFile(resolve(webRoot, '../LICENSE'), join(dist, 'license.txt')),
  copyFile(resolve(webRoot, '../THIRD_PARTY_NOTICES.md'), join(dist, 'third-party-notices.txt')),
  build({
    root: webRoot,
    logLevel: 'warn',
    build: {
      ssr: 'src/entry-server.tsx',
      outDir: serverDir,
      copyPublicDir: false,
      sourcemap: false,
    },
  }),
]);

// Build lightweight route descriptors (workers read JSON payloads on demand so peak RAM stays low).
const routeTasks = [
  ...['/', '/far', '/aim', '/study', '/quizzes', '/flashcards', '/search', '/updates', '/privacy', '/terms', '/support']
    .map((pathname) => ({ pathname })),
];

for (const [directory, prefix, field, route] of [
  ['far', 'part', 'farPart', 'far'],
  ['aim', 'chapter', 'aimChapter', 'aim'],
]) {
  const regex = new RegExp(`^${prefix}(\\d+)\\.json$`);
  for (const name of (await readdir(join(dataRoot, directory))).sort()) {
    const match = name.match(regex);
    if (!match) continue;
    routeTasks.push({
      pathname: `/${route}/${match[1]}`,
      dataFile: join(dataRoot, directory, name),
      dataField: field,
    });
  }
}

for (const [directory, route, dataField] of [
  ['quizzes', 'quizzes', undefined],
  ['flashcards', 'flashcards', 'flashcardDeck'],
]) {
  for (const name of (await readdir(join(dataRoot, directory))).filter((file) => file.endsWith('.json')).sort()) {
    const id = name.slice(0, -'.json'.length);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error(`Invalid ${directory} route ID in ${name}.`);
    }
    routeTasks.push({
      pathname: `/${route}/${id}`,
      dataFile: join(dataRoot, directory, name),
      dataField,
      validateId: id,
    });
  }
}

const serverEntryUrl = pathToFileURL(join(serverDir, 'entry-server.js')).href;
const workerCount = Math.min(8, Math.max(1, availableParallelism()), routeTasks.length);
const buckets = Array.from({ length: workerCount }, () => []);
// Distribute round-robin so large FAR parts balance evenly across workers.
routeTasks.forEach((task, index) => {
  buckets[index % workerCount].push(task);
});

const workerCode = `
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

const { serverEntryUrl, dist, template, tasks } = workerData;
const { render } = await import(serverEntryUrl);

for (const task of tasks) {
  let data = {};
  if (task.dataFile) {
    const content = JSON.parse(await readFile(task.dataFile, 'utf8'));
    if (task.validateId && content.id !== task.validateId) {
      throw new Error(\`Invalid route ID in \${task.dataFile}.\`);
    }
    if (task.dataField) {
      data = { [task.dataField]: content };
    }
  }
  const { body, head } = await render(task.pathname, data);
  if (!body.includes('<h1') || body.includes('<!--$!-->')) {
    throw new Error(\`Prerendered route \${task.pathname} has no heading or suspended during rendering.\`);
  }
  let page = template.replace(/<title\\b[^>]*>[\\s\\S]*?<\\/title>/, '');
  if (/<meta\\b[^>]*name="description"/.test(head)) {
    page = page.replace(/<meta\\b[^>]*name="description"[^>]*>/, '');
  }
  const canonical = head.includes('rel="canonical"')
    ? ''
    : \`<link rel="canonical" href="https://faraim.online\${task.pathname === '/' ? '' : task.pathname}"/>\`;
  page = page
    .replace('</head>', \`\${head}\${canonical}</head>\`)
    .replace('<div id="root"></div>', \`<div id="root" data-prerendered="\${task.pathname}">\${body}</div>\`);
  const directory = join(dist, task.pathname.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'index.html'), page);
}
parentPort.postMessage({ count: tasks.length });
`;

await Promise.all(
  buckets.map(
    (tasks) =>
      new Promise((resolveWorker, rejectWorker) => {
        const worker = new Worker(workerCode, {
          eval: true,
          workerData: { serverEntryUrl, dist, template, tasks },
        });
        worker.on('error', rejectWorker);
        worker.on('exit', (code) => {
          if (code !== 0) rejectWorker(new Error(`Prerender worker exited with code ${code}`));
        });
        worker.on('message', () => resolveWorker());
      }),
  ),
);

await rm(serverDir, { recursive: true, force: true });
console.log(`Prerendered ${routeTasks.length} pages across ${workerCount} workers. The SPA fallback is dist/spa.html.`);
