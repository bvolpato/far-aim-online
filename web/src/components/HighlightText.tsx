const regexCache = new Map<string, RegExp>();
const MAX_REGEX_CACHE = 48;

const HIGHLIGHT_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were',
  'with', 'this', 'not', 'but',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getHighlightRegex(trimmedQuery: string): RegExp | null {
  const cached = regexCache.get(trimmedQuery);
  if (cached) return cached;

  const patterns: string[] = [];
  const seen = new Set<string>();

  const addPattern = (raw: string, requireBoundaries: boolean) => {
    const escaped = escapeRegExp(raw);
    const expr = requireBoundaries ? `\\b${escaped}\\b` : escaped;
    if (!seen.has(expr)) {
      seen.add(expr);
      patterns.push(expr);
    }
  };

  // Full phrase first (so "Class B" or "cross-country" highlights as a single span).
  const fullShort = trimmedQuery.length <= 2 && /^[a-z0-9]+$/i.test(trimmedQuery);
  addPattern(trimmedQuery, fullShort);

  if (/\s/.test(trimmedQuery)) {
    const words = trimmedQuery.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const lower = word.toLowerCase();
      if (word.length === 1) continue;
      if (HIGHLIGHT_STOP_WORDS.has(lower)) continue;
      const needsBoundary = word.length <= 2 || /^\d+[.\-]\d+/.test(word);
      addPattern(word, needsBoundary);
    }
  }

  if (patterns.length === 0) return null;

  // Longest patterns first so full phrases win over component words.
  patterns.sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${patterns.join('|')})`, 'gi');
  regexCache.set(trimmedQuery, regex);
  if (regexCache.size > MAX_REGEX_CACHE) {
    regexCache.delete(regexCache.keys().next().value!);
  }
  return regex;
}

interface HighlightTextProps {
  text: string | null | undefined;
  query: string;
}

export function HighlightText({ text, query }: HighlightTextProps) {
  if (!text) return null;
  if (!query) return <>{text}</>;

  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) return <>{text}</>;

  const regex = getHighlightRegex(trimmedQuery);
  if (!regex) return <>{text}</>;

  const parts = text.split(regex);
  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) =>
        // String.prototype.split with a single capturing group places matches at odd indices.
        i % 2 === 1 ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded-sm px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
