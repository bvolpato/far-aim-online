import { getFARPartMeta } from './catalog';
import { fetchJsonAsset, type JsonAssetLoader } from './jsonAssets';
import type { FARPart } from './types';

const farPartAssetUrls = import.meta.glob('../../../data/far/part*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, JsonAssetLoader>;

export async function getFARPart(partNumber: number): Promise<FARPart | undefined> {
  const meta = getFARPartMeta(partNumber);
  if (!meta) {
    return undefined;
  }

  const part = await fetchJsonAsset<FARPart>(farPartAssetUrls, `../../../data/far/part${partNumber}.json`);
  if (!part) {
    return undefined;
  }

  if (part.cfr !== meta.cfr) {
    throw new Error(`FAR Part ${partNumber} metadata mismatch: expected ${meta.cfr}, loaded ${part.cfr}`);
  }
  return part;
}
