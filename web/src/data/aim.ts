import { fetchJsonAsset, type JsonAssetLoader } from './jsonAssets';
import type { AIMChapter } from './types';

const aimChapterAssetUrls = import.meta.glob('../../../data/aim/chapter*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, JsonAssetLoader>;

export async function getAIMChapter(chapterNumber: number): Promise<AIMChapter | undefined> {
  return fetchJsonAsset<AIMChapter>(aimChapterAssetUrls, `../../../data/aim/chapter${chapterNumber}.json`);
}
