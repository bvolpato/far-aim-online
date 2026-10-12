import { copyFile, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { build } from 'vite';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = join(webRoot, 'dist');
const serverDir = join(webRoot, '.cache/prerender');
const dataRoot = resolve(webRoot, '../data');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

await build({ root: webRoot });
const template = await readFile(join(dist, 'index.html'), 'utf8');
if (!template.includes('<div id="root"></div>')) {
  throw new Error('The app template must contain an empty root element for prerendering.');
}
await writeFile(join(dist, 'spa.html'), template);
await writeFile(join(dist, '404.html'), template);

// The mobile sync still consumes the legacy indexes. The web uses hashed shards.
for (const name of await readdir(dist)) {
  if (/^(?:inverted-index|search-metadata)-.*\.json$/.test(name)) {
    await rm(join(dist, name));
  }
}

await build({
  root: webRoot,
  logLevel: 'warn',
  build: {
    ssr: 'src/entry-server.tsx',
    outDir: serverDir,
    copyPublicDir: false,
    sourcemap: false,
  },
});
const { render } = await import(new URL('../.cache/prerender/entry-server.js', import.meta.url));
const pages = [
  ...['/', '/far', '/aim', '/study', '/quizzes', '/flashcards', '/search', '/updates', '/privacy', '/terms', '/support']
    .map((pathname) => ({ pathname, data: {} })),
];

for (const [directory, prefix, field, route] of [
  ['far', 'part', 'farPart', 'far'],
  ['aim', 'chapter', 'aimChapter', 'aim'],
]) {
  for (const name of (await readdir(join(dataRoot, directory))).sort()) {
    if (!new RegExp(`^${prefix}\\d+\\.json$`).test(name)) continue;
    const content = await readJson(join(dataRoot, directory, name));
    pages.push({ pathname: `/${route}/${content[prefix]}`, data: { [field]: content } });
  }
}

for (const [directory, route, dataField] of [
  ['quizzes', 'quizzes', undefined],
  ['flashcards', 'flashcards', 'flashcardDeck'],
]) {
  for (const name of (await readdir(join(dataRoot, directory))).filter((file) => file.endsWith('.json')).sort()) {
    const content = await readJson(join(dataRoot, directory, name));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(content.id) || `${content.id}.json` !== name) {
      throw new Error(`Invalid ${directory} route ID in ${name}.`);
    }
    pages.push({
      pathname: `/${route}/${content.id}`,
      data: dataField ? { [dataField]: content } : {},
    });
  }
}

for (const { pathname, data } of pages) {
  const { body, head } = await render(pathname, data);
  if (!body.includes('<h1') || body.includes('<!--$!-->')) {
    throw new Error(`Prerendered route ${pathname} has no heading or suspended during rendering.`);
  }
  let page = template.replace(/<title\b[^>]*>[\s\S]*?<\/title>/, '');
  if (/<meta\b[^>]*name="description"/.test(head)) {
    page = page.replace(/<meta\b[^>]*name="description"[^>]*>/, '');
  }
  const canonical = head.includes('rel="canonical"')
    ? ''
    : `<link rel="canonical" href="https://faraim.online${pathname === '/' ? '' : pathname}"/>`;
  page = page
    .replace('</head>', `${head}${canonical}</head>`)
    .replace('<div id="root"></div>', `<div id="root" data-prerendered="${pathname}">${body}</div>`);
  const directory = join(dist, pathname.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'index.html'), page);
}

await rm(serverDir, { recursive: true, force: true });
await Promise.all([
  copyFile(resolve(webRoot, '../LICENSE'), join(dist, 'license.txt')),
  copyFile(resolve(webRoot, '../THIRD_PARTY_NOTICES.md'), join(dist, 'third-party-notices.txt')),
]);
console.log(`Prerendered ${pages.length} pages. The SPA fallback is dist/spa.html.`);
