import type { AdvisoryCircular } from '../data';

export type AdvisoryCircularSort = 'newest' | 'oldest' | 'number' | 'title';

export function sortAdvisoryCirculars(
  circulars: AdvisoryCircular[],
  sort: AdvisoryCircularSort
) {
  return [...circulars].sort((left, right) => {
    if (sort === 'newest') {
      return right.issued.localeCompare(left.issued) || left.number.localeCompare(right.number);
    }

    if (sort === 'oldest') {
      return left.issued.localeCompare(right.issued) || left.number.localeCompare(right.number);
    }

    if (sort === 'title') {
      return left.title.localeCompare(right.title) || left.number.localeCompare(right.number);
    }

    return left.number.localeCompare(right.number, undefined, { numeric: true });
  });
}
