import { fetchJsonAsset, type JsonAssetLoader } from './jsonAssets';
import type { PCGTerm } from './types';

const pcgAssetUrls = import.meta.glob('../../../data/aim/pcg.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, JsonAssetLoader>;

let pcgTermsPromise: Promise<PCGTerm[]> | undefined;

export async function getPCGTerms(): Promise<PCGTerm[]> {
  if (!pcgTermsPromise) {
    pcgTermsPromise = fetchJsonAsset<{ terms?: PCGTerm[] }>(
      pcgAssetUrls,
      '../../../data/aim/pcg.json',
    ).then((data) => data?.terms || []).catch((error: unknown) => {
      pcgTermsPromise = undefined;
      throw error;
    });
  }

  return pcgTermsPromise;
}
