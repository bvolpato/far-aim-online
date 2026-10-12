export function formatAIMChapterLabel(chapter: number | string): string {
  const value = Number(chapter);
  return value === 0 ? 'General Information' : `Chapter ${value}`;
}

export function formatAIMChapterBadge(chapter: number): string {
  return chapter === 0 ? 'General' : `Chapter ${chapter}`;
}
