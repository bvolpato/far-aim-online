import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./generated/search-manifest.json', () => ({ default: {
  chunkSize: 8192,
  chunkOverlap: 200,
  documentGroupSize: 2,
  pilotParts: [91],
  collections: {
    far: { count: 3, metadata: ['far/docs0', 'far/docs1'], parts: [[91, 0, 1], [125, 2, 2]], prefixes: { ai: 'far/lookup', '91': 'far/numeric' } },
    'far-pilot': { count: 2, metadata: ['pilot/docs'], parts: [[91, 0, 1]], prefixes: { ai: 'pilot/lookup', '91': 'pilot/numeric' } },
    aim: { count: 1, metadata: ['aim/docs'], parts: [], prefixes: { ai: 'aim/lookup' } },
    ac: { count: 1, metadata: ['ac/docs'], parts: [], prefixes: { ca: 'ac/lookup' } },
  },
} }));

const fixture: Record<string, unknown> = {
  'pilot/lookup': { ai: 'pilot/index' },
  'pilot/numeric': { '91': 'pilot/index' },
  'pilot/index': { airspace: [[0, 150, 0], [1, 450, 8]], airspeed: [[0, 100, 0]], '91205': [[1, 450, 0]] },
  'pilot/docs': [['Flight rules', '14 CFR Part 91', '/far/91#91.1', ['content/a']], ['Airspace', '14 CFR Part 91', '/far/91#91.205', ['content/b']]],
  'far/lookup': { ai: 'far/index' },
  'far/numeric': { '91': 'far/index' },
  'far/index': { airspace: [[0, 150, 0], [1, 450, 8], [2, 100, 0]] },
  'far/docs0': [['Flight rules', '14 CFR Part 91', '/far/91#91.1', ['content/a']], ['Airspace', '14 CFR Part 91', '/far/91#91.205', ['content/b']]],
  'far/docs1': [['Operator rules', '14 CFR Part 125', '/far/125#125.1', ['content/a']]],
  'aim/lookup': { ai: 'aim/index' },
  'aim/index': { airspace: [[0, 150, 0]] },
  'aim/docs': [['AIM airspace', 'AIM Chapter 4', '/aim/4#4-1-1', ['content/a']]],
  'ac/lookup': { ca: 'ac/index' },
  'ac/index': { carburetor: [[0, 150, 28]] },
  'ac/docs': [['Engine operation', 'FAA Advisory Circular', '/advisory-circulars/engine', ['content/ac']]],
  'content/a': 'Airspace and airspeed requirements for pilots.',
  'content/b': 'Special airspace rules and operating requirements.',
  'content/ac': 'Extracted page from the circular: carburetor icing can occur in these conditions.',
};

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.resetModules();
  fetchMock = vi.fn<typeof fetch>(async input => {
    const name = String(input).replace('/search/', '');
    if (!(name in fixture)) throw new Error(`Unexpected request ${name}`);
    return new Response(JSON.stringify(fixture[name]), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function requested(): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

describe('query-scoped search', () => {
  it('avoids downloads for empty, short, stop-word, unselected, and unavailable prefixes', async () => {
    const { searchContent } = await import('./search');
    for (const query of ['', 'ai', 'the and', 'zzzz']) await expect(searchContent(query, ['far'])).resolves.toEqual([]);
    await expect(searchContent('airspace', [])).resolves.toEqual([]);
    await expect(searchContent('airspace', ['far'], new Set())).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads only the pilot collection, ranks title matches first, and defers undisplayed metadata', async () => {
    const { searchContent } = await import('./search');
    const results = await searchContent('airspace', ['far'], new Set([91]), { resultLimit: 1 });
    expect(results).toMatchObject([{ title: 'Airspace', content: expect.stringContaining('airspace') }]);
    expect(requested()).toEqual(['/search/pilot/lookup', '/search/pilot/index', '/search/pilot/docs', '/search/content/b']);
  });

  it('does not fetch metadata or text for lower-ranked results', async () => {
    const { searchContent } = await import('./search');
    const results = await searchContent('airspace', ['far'], undefined, { resultLimit: 1 });
    expect(results).toHaveLength(1);
    expect(requested()).not.toContain('/search/far/docs1');
    expect(requested()).not.toContain('/search/content/a');
  });

  it('supports prefix matching, whole-word priority, and multi-word intersections', async () => {
    const { searchContent } = await import('./search');
    expect(await searchContent('airs', ['far'], new Set([91]))).toHaveLength(2);
    expect(await searchContent('airspace airspeed', ['far'], new Set([91]))).toMatchObject([{ title: 'Flight rules' }]);
  });

  it('normalizes regulation identifiers consistently with the generated index', async () => {
    const { searchContent } = await import('./search');
    expect(await searchContent('§91.205', ['far'], new Set([91]))).toMatchObject([{ link: '/far/91#91.205' }]);
  });

  it('keeps extracted circular text searchable and returns its matching passage', async () => {
    const { searchContent } = await import('./search');
    expect(await searchContent('carburetor', ['ac'])).toMatchObject([{ type: 'ac', content: expect.stringContaining('carburetor icing') }]);
  });

  it('shares in-flight requests and reuses successful searches', async () => {
    const { searchContent } = await import('./search');
    await Promise.all([searchContent('airspace', ['aim']), searchContent('airspace', ['aim'])]);
    await searchContent('airspace', ['aim']);
    expect(requested()).toHaveLength(4);
    expect(new Set(requested()).size).toBe(4);
  });

  it('evicts failed loads so retry can recover', async () => {
    const { searchContent } = await import('./search');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(searchContent('airspace', ['aim'])).rejects.toThrow('Failed to load search data: aim/lookup');
    await expect(searchContent('airspace', ['aim'])).resolves.toHaveLength(1);
    expect(requested().filter(url => url.endsWith('aim/lookup'))).toHaveLength(2);
  });

  it('publishes ranked links before optional excerpts arrive', async () => {
    const { searchContent } = await import('./search');
    const onProgress = vi.fn();
    const implementation = fetchMock.getMockImplementation()!;
    let release: (() => void) | undefined;
    fetchMock.mockImplementation(async (...args) => {
      if (String(args[0]).includes('/content/')) await new Promise<void>(resolve => { release = resolve; });
      return implementation(...args);
    });
    const searching = searchContent('airspace', ['aim'], undefined, { onProgress });
    await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith([expect.objectContaining({ title: 'AIM airspace', content: '' })], 1));
    release!();
    expect(await searching).toMatchObject([{ content: expect.stringContaining('Airspace') }]);
  });

  it('keeps successful category results available when another category fails', async () => {
    const { searchContent } = await import('./search');
    const onProgress = vi.fn();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(searchContent('airspace', ['far', 'aim'], undefined, { onProgress })).rejects.toThrow();
    expect(onProgress).toHaveBeenLastCalledWith([expect.objectContaining({ type: 'aim' })], 1);
  });

  it('stops downstream downloads and updates when a query is superseded', async () => {
    const { searchContent } = await import('./search');
    const controller = new AbortController();
    const onProgress = vi.fn();
    const searching = searchContent('airspace', ['aim'], undefined, { signal: controller.signal, onProgress });
    controller.abort();
    await expect(searching).rejects.toThrow();
    expect(requested()).toEqual(['/search/aim/lookup']);
    expect(onProgress).not.toHaveBeenCalled();
  });
});
