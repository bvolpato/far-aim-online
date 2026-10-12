import { describe, expect, it } from 'vitest';
import { formatAIMChapterBadge, formatAIMChapterLabel } from './aim';

describe('AIM chapter labels', () => {
  it('avoids calling change notes and appendices chapter 0', () => {
    expect(formatAIMChapterLabel(0)).toBe('General Information');
    expect(formatAIMChapterBadge(0)).toBe('General');
    expect(formatAIMChapterLabel(4)).toBe('Chapter 4');
    expect(formatAIMChapterBadge(4)).toBe('Chapter 4');
  });
});
