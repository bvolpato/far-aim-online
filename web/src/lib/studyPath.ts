export type StudyPathType = 'far' | 'aim' | 'ac';

export function isValidStudyPath(type: StudyPathType, path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) {
    return false;
  }

  let pathname: string;
  try {
    pathname = new URL(path, 'https://faraim.local').pathname;
  } catch {
    return false;
  }

  if (type === 'far') return /^\/far\/\d+$/.test(pathname);
  if (type === 'aim') return /^\/aim\/\d+$/.test(pathname);

  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'advisory-circulars' && segments.length <= 2;
}
