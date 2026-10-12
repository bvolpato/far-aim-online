import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from './generated/search-manifest.json';

const paths = new Set<string>();

beforeEach(() => {
  vi.resetModules();
  paths.clear();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => {
    const file = String(input);
    paths.add(file);
    return new Response(readFileSync(new URL(`../../public${file}`, import.meta.url), 'utf8'));
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('generated search corpus', () => {
  it('returns contextual airspace results within a 300KB compressed cold-search budget', async () => {
    const { searchContent } = await import('./search');
    const results = await searchContent('airspace', ['far', 'aim', 'pcg', 'ac', 'flashcards'], new Set(manifest.pilotParts), { resultLimit: 10 });
    expect(results).toHaveLength(10);
    expect(results.every(result => result.title && result.link && result.content)).toBe(true);
    const bytes = [...paths].reduce((sum, file) => sum + gzipSync(readFileSync(new URL(`../../public${file}`, import.meta.url))).length, 0)
      + gzipSync(JSON.stringify(manifest)).length;
    expect(bytes).toBeLessThan(300 * 1024);
    expect([...paths].filter(file => file.includes('/content/')).length).toBeLessThanOrEqual(10);
    expect([...paths].some(file => file.startsWith('/search/far/'))).toBe(false);
    console.info(`Airspace cold search: ${paths.size} files, ${bytes} gzip bytes including manifest; top result: ${results[0].title}`);
  });

  it('preserves table, circular full-text, and specific regulation matches', async () => {
    const { searchContent } = await import('./search');
    expect(await searchContent('SSV Designator', ['aim'], undefined, { resultLimit: 10 }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ title: expect.stringContaining('NAVAID Service Volumes') })]));
    const circulars = await searchContent('carburetor', ['ac'], undefined, { resultLimit: 3 });
    expect(circulars.length).toBeGreaterThan(0);
    expect(circulars.some(result => /carburetor/i.test(result.content))).toBe(true);
    expect(await searchContent('91.205', ['far'], new Set([91]), { resultLimit: 10 }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ link: '/far/91#91.205' })]));
  });
});
