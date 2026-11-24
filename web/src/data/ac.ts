import { fetchJsonAsset, type JsonAssetLoader } from './jsonAssets';
import type { AdvisoryCircular, AdvisoryCircularContent } from './types';

const advisoryCircularAssetUrls = import.meta.glob('../../../data/advisory-circulars/index.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, JsonAssetLoader>;

const advisoryCircularContentAssetUrls = import.meta.glob(
  '../../../data/advisory-circulars/content/*.json',
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
) as Record<string, JsonAssetLoader>;

let advisoryCircularsPromise: Promise<AdvisoryCircular[]> | undefined;

export async function getAdvisoryCirculars(): Promise<AdvisoryCircular[]> {
  if (!advisoryCircularsPromise) {
    advisoryCircularsPromise = fetchJsonAsset<{ items?: AdvisoryCircular[] }>(
      advisoryCircularAssetUrls,
      '../../../data/advisory-circulars/index.json',
    ).then((data) =>
      (data?.items || [])
        .slice()
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    ).catch((error: unknown) => {
      advisoryCircularsPromise = undefined;
      throw error;
    });
  }
  return advisoryCircularsPromise;
}

export async function getAdvisoryCircularContent(
  advisoryCircular: AdvisoryCircular,
): Promise<AdvisoryCircularContent | undefined> {
  if (!advisoryCircular.contentPath) return undefined;

  return fetchJsonAsset<AdvisoryCircularContent>(
    advisoryCircularContentAssetUrls,
    `../../../data/advisory-circulars/${advisoryCircular.contentPath}`,
  );
}
