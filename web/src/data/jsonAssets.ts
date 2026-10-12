export type JsonAssetLoader = string | (() => Promise<string>);

const jsonAssetPromises = new Map<string, Promise<unknown>>();

export async function fetchJsonAsset<T>(
  loaders: Record<string, JsonAssetLoader>,
  path: string,
): Promise<T | undefined> {
  const loadUrl = loaders[path];
  if (!loadUrl) return undefined;

  const url = typeof loadUrl === 'string' ? loadUrl : await loadUrl();
  let promise = jsonAssetPromises.get(url);
  if (!promise) {
    promise = fetch(url).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.status}`);
      }
      return response.json() as Promise<unknown>;
    }).catch((error: unknown) => {
      jsonAssetPromises.delete(url);
      throw error;
    });
    jsonAssetPromises.set(url, promise);
  }

  return promise as Promise<T>;
}
