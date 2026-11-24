import React from 'react';
import { HighlightText } from '../components/HighlightText';

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  return <HighlightText text={text} query={query} />;
}
