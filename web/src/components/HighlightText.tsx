interface HighlightTextProps {
  text: string | null | undefined;
  query: string;
}

const regexCache = new Map<string, RegExp>();
const MAX_REGEX_CACHE = 32;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getHighlightRegex(trimmedQuery: string): RegExp {
  const cached = regexCache.get(trimmedQuery);
  if (cached) return cached;

  // Build search patterns:
  // 1. First, try the full query as-is (handles "cross-country" as one term)
  // 2. Then, also match individual words for multi-word queries like "VFR flight"
  const patterns: string[] = [escapeRegExp(trimmedQuery)];

  if (trimmedQuery.includes(' ')) {
    const words = trimmedQuery.split(/\s+/).filter((w) => w.length > 1);
    for (const word of words) {
      const escaped = escapeRegExp(word);
      if (!patterns.includes(escaped)) {
        patterns.push(escaped);
      }
    }
  }

  // Sort by length (longest first) to prefer matching "cross-country" over "cross"
  patterns.sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${patterns.join('|')})`, 'gi');
  regexCache.set(trimmedQuery, regex);
  if (regexCache.size > MAX_REGEX_CACHE) {
    regexCache.delete(regexCache.keys().next().value!);
  }
  return regex;
}

export function HighlightText({ text, query }: HighlightTextProps) {
  if (!text) return null;
  if (!query) return <>{text}</>;

  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) return <>{text}</>;

  const parts = text.split(getHighlightRegex(trimmedQuery));
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
