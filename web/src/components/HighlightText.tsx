interface HighlightTextProps {
  text: string | null | undefined;
  query: string;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function HighlightText({ text, query }: HighlightTextProps) {
  if (!text) return null;
  if (!query) return <>{text}</>;

  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) return <>{text}</>;

  // Build search patterns:
  // 1. First, try the full query as-is (handles "cross-country" as one term)
  // 2. Then, also match individual words for multi-word queries like "VFR flight"
  const patterns: string[] = [];
  
  // Add the full query (escaped) - this handles hyphenated terms like "cross-country"
  patterns.push(escapeRegExp(trimmedQuery));
  
  // If the query contains spaces (multi-word), also add individual words
  // But skip this for hyphenated single words
  if (trimmedQuery.includes(' ')) {
    const words = trimmedQuery.split(/\s+/).filter(w => w.length > 1);
    words.forEach(word => {
      const escaped = escapeRegExp(word);
      if (!patterns.includes(escaped)) {
        patterns.push(escaped);
      }
    });
  }

  // Create regex that matches any pattern
  // Sort by length (longest first) to prefer matching "cross-country" over "cross"
  patterns.sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${patterns.join('|')})`, 'gi');

  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, i) => {
        // Check if this part matches any of our patterns (case-insensitive)
        const isMatch = patterns.some(p => {
          const patternRegex = new RegExp(`^${p}$`, 'i');
          return patternRegex.test(part);
        });
        
        return isMatch ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded-sm px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}