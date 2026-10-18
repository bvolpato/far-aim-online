import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HighlightText } from './HighlightText';

interface FormattedContentProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  highlight?: string;
  stripTableBlocks?: boolean;
  tableCaption?: string;
}

/**
 * Parses and renders formatted content with:
 * - **bold** text (double asterisks)
 * - *italic* text (single asterisks)
 * - CFR cross-references as links (§ XX.XX, Part XX)
 * - Highlighting of search terms
 */
export function FormattedContent({
  text,
  className = '',
  style,
  highlight = '',
  stripTableBlocks = false,
  tableCaption = 'Reference table',
}: FormattedContentProps) {
  const displayText = stripTableBlocks
    ? text.replace(/\n*\[TABLE\][\s\S]*?\[\/TABLE\]\n*/g, '\n\n').trim()
    : text;
  const elements = useMemo(
    () => parseContent(displayText, highlight, tableCaption),
    [displayText, highlight, tableCaption],
  );
  
  return (
    <div className={`whitespace-pre-line [overflow-wrap:anywhere] ${className}`} style={style}>
      {elements}
    </div>
  );
}

function parseContent(text: string, highlight: string, tableCaption: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let key = 0;

  const blocks = text.split(/(\[TABLE\][\s\S]*?\[\/TABLE\])/g);

  blocks.forEach((block, blockIndex) => {
    if (!block) {
      return;
    }

    if (block.startsWith('[TABLE]')) {
      const table = parseTableBlock(block);
      if (table.headers.length > 0 || table.rows.length > 0) {
        if (blockIndex > 0) {
          elements.push(<br key={`table-space-${key++}`} />);
        }
        elements.push(
          <RawTable key={`table-${key++}`} table={table} highlight={highlight} caption={tableCaption} />
        );
      }
      return;
    }

    // Split by paragraphs first to maintain structure
    const paragraphs = block.split(/\n\n+/).filter(paragraph => paragraph.trim().length > 0);

    paragraphs.forEach((paragraph, pIndex) => {
      if (elements.length > 0 || pIndex > 0) {
        elements.push(<br key={`br1-${key++}`} />);
        elements.push(<br key={`br2-${key++}`} />);
      }

      // Process inline formatting within each paragraph
      const inlineElements = parseInlineFormatting(paragraph, key, highlight);
      key += inlineElements.length + 100; // Ensure unique keys
      elements.push(...inlineElements);
    });
  });

  return elements;
}

interface RawTable {
  headers: string[];
  rows: string[][];
}

const PAGINATED_TABLE_ROW_LIMIT = 50;
const TABLE_PAGE_SIZE = 25;
const EMPTY_TABLE_HEADERS: string[] = [];

function parseTableBlock(block: string): RawTable {
  const body = block.replace(/^\[TABLE\]\s*/, '').replace(/\s*\[\/TABLE\]$/, '');
  const groups = body
    .split(/\n\s*\n/g)
    .map(group => parseTableCells(group))
    .filter(cells => cells.length > 0);

  if (groups.length === 0) {
    return { headers: [], rows: [] };
  }

  if (groups.length === 1) {
    return { headers: groups[0], rows: [] };
  }

  return { headers: groups[0], rows: groups.slice(1) };
}

function parseTableCells(group: string): string[] {
  const trimmed = group.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.includes('|')) {
    return trimmed
      .split('\n')
      .flatMap(line => {
        const cells: string[] = [];
        let cell = '';

        for (let index = 0; index < line.length; index += 1) {
          const character = line[index];
          const nextCharacter = line[index + 1];

          if (character === '\\' && (nextCharacter === '|' || nextCharacter === '\\')) {
            cell += nextCharacter;
            index += 1;
          } else if (character === '|') {
            cells.push(cell);
            cell = '';
          } else {
            cell += character;
          }
        }

        cells.push(cell);
        if (cells[0]?.trim() === '') cells.shift();
        if (cells[cells.length - 1]?.trim() === '') cells.pop();
        return cells.map(value => value.trim());
      });
  }

  return trimmed
    .split(/\s{2,}/)
    .map(cell => cell.trim())
    .filter(Boolean);
}

function RawTable({ table, highlight, caption }: { table: RawTable; highlight: string; caption: string }) {
  const rows = useMemo(() => table.rows.length > 0 ? table.rows : [table.headers], [table]);
  const headers = table.rows.length > 0 ? table.headers : EMPTY_TABLE_HEADERS;
  const paginated = rows.length > PAGINATED_TABLE_ROW_LIMIT;
  const normalizedHighlight = highlight.trim().toLowerCase();
  const matchingRowIndexes = useMemo(() => {
    if (!normalizedHighlight) return [];

    const queryTokens = normalizedHighlight.includes(' ')
      ? normalizedHighlight.split(/\s+/).filter((token) => token.length > 1)
      : [];
    const exactMatches: number[] = [];
    const tokenMatches: number[] = [];

    rows.forEach((row, index) => {
      const cells = row.map((cell) => cell.toLowerCase());
      if (cells.some((cell) => cell.includes(normalizedHighlight))) {
        exactMatches.push(index);
      } else if (queryTokens.length > 0 && cells.some((cell) => queryTokens.some((token) => cell.includes(token)))) {
        tokenMatches.push(index);
      }
    });

    return [...exactMatches, ...tokenMatches];
  }, [normalizedHighlight, rows]);
  const [pageIndex, setPageIndex] = useState(0);
  const [activeMatchIndex, setActiveMatchIndex] = useState<number | null>(null);
  const [isInteractive, setIsInteractive] = useState(false);
  const pageCount = Math.ceil(rows.length / TABLE_PAGE_SIZE);
  const visiblePageIndex = Math.max(0, Math.min(pageIndex, pageCount - 1));

  useEffect(() => {
    setIsInteractive(true);
  }, []);

  useEffect(() => {
    if (!paginated) {
      setPageIndex(0);
      setActiveMatchIndex(null);
      return;
    }

    const firstMatch = matchingRowIndexes[0];
    setPageIndex(firstMatch === undefined ? 0 : Math.floor(firstMatch / TABLE_PAGE_SIZE));
    setActiveMatchIndex(firstMatch === undefined ? null : 0);
  }, [matchingRowIndexes, paginated, table]);

  const pageStart = paginated ? visiblePageIndex * TABLE_PAGE_SIZE : 0;
  const pageEnd = paginated ? Math.min(pageStart + TABLE_PAGE_SIZE, rows.length) : rows.length;
  const visibleRows = rows.slice(pageStart, pageEnd);

  const goToPage = (nextPage: number) => {
    const boundedPage = Math.max(0, Math.min(nextPage, pageCount - 1));
    const nextStart = boundedPage * TABLE_PAGE_SIZE;
    const nextEnd = Math.min(nextStart + TABLE_PAGE_SIZE, rows.length);
    const matchOnPage = matchingRowIndexes.findIndex((rowIndex) => rowIndex >= nextStart && rowIndex < nextEnd);

    setPageIndex(boundedPage);
    setActiveMatchIndex(matchOnPage < 0 ? null : matchOnPage);
  };

  const goToMatch = (matchIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(matchIndex, matchingRowIndexes.length - 1));
    const rowIndex = matchingRowIndexes[boundedIndex];
    if (rowIndex === undefined) return;

    setActiveMatchIndex(boundedIndex);
    setPageIndex(Math.floor(rowIndex / TABLE_PAGE_SIZE));
  };

  const fullTableText = useMemo(() => {
    const sourceRows = headers.length > 0 ? [headers, ...rows] : rows;
    return sourceRows
      .map((row) => `| ${row.map((cell) => cell.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')).join(' | ')} |`)
      .join('\n');
  }, [headers, rows]);

  return (
    <div className="my-4 rounded-lg border border-border">
      <div className="overflow-x-auto rounded-t-lg">
        <table
          className="min-w-full divide-y divide-border"
          aria-rowcount={rows.length + (headers.length > 0 ? 1 : 0)}
        >
          <caption className="sr-only">{caption}</caption>
          {headers.length > 0 && (
            <thead className="bg-muted/60">
              <tr aria-rowindex={1}>
                {headers.map((header, index) => (
                  <th
                    key={index}
                    scope="col"
                    className={`px-3 py-2 text-left font-semibold text-foreground ${paginated ? 'min-w-32' : ''}`}
                  >
                    <HighlightText text={header} query={highlight} />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-border bg-card">
            {visibleRows.map((row, pageRowIndex) => {
              const rowIndex = pageStart + pageRowIndex;
              return (
                <tr key={rowIndex} aria-rowindex={rowIndex + (headers.length > 0 ? 2 : 1)}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={`px-3 py-2 align-top text-muted-foreground ${paginated ? 'min-w-32' : ''}`}>
                      <HighlightText text={cell} query={highlight} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {paginated && (
        <div className="space-y-2 border-t border-border p-2 sm:p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Rows {pageStart + 1}–{pageEnd} of {rows.length}
            </p>
            <div role="group" aria-label="Table pagination" className="table-pagination-controls flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => goToPage(0)}
                disabled={!isInteractive || visiblePageIndex === 0}
                className="min-h-11 rounded-md border border-border px-3 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                First page
              </button>
              <button
                type="button"
                onClick={() => goToPage(visiblePageIndex - 1)}
                disabled={!isInteractive || visiblePageIndex === 0}
                className="min-h-11 rounded-md border border-border px-3 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous page
              </button>
              <button
                type="button"
                onClick={() => goToPage(visiblePageIndex + 1)}
                disabled={!isInteractive || visiblePageIndex >= pageCount - 1}
                className="min-h-11 rounded-md border border-border px-3 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next page
              </button>
              <button
                type="button"
                onClick={() => goToPage(pageCount - 1)}
                disabled={!isInteractive || visiblePageIndex >= pageCount - 1}
                className="min-h-11 rounded-md border border-border px-3 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Last page
              </button>
            </div>
          </div>
          {normalizedHighlight && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {matchingRowIndexes.length === 0
                  ? 'No matching rows in this table.'
                  : `${matchingRowIndexes.length} highlighted row${matchingRowIndexes.length === 1 ? '' : 's'}; match ${activeMatchIndex === null ? 'not selected' : `${activeMatchIndex + 1} of ${matchingRowIndexes.length}, row ${matchingRowIndexes[activeMatchIndex] + 1}`}`}
              </p>
              {matchingRowIndexes.length > 0 && (
                <div role="group" aria-label="Search matches in table" className="table-pagination-controls flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => goToMatch((activeMatchIndex ?? 0) - 1)}
                    disabled={!isInteractive || activeMatchIndex === 0}
                    aria-label="Previous matching row"
                    className="min-h-11 rounded-md border border-border px-3 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous match
                  </button>
                  <button
                    type="button"
                    onClick={() => goToMatch((activeMatchIndex ?? -1) + 1)}
                    disabled={!isInteractive || activeMatchIndex === matchingRowIndexes.length - 1}
                    aria-label="Next matching row"
                    className="min-h-11 rounded-md border border-border px-3 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next match
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {paginated && (
        <noscript>
          <style>{'.table-pagination-controls { display: none; }'}</style>
          <details className="border-t border-border p-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-foreground">
              Read all table rows as plain text
            </summary>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {fullTableText}
            </pre>
          </details>
        </noscript>
      )}
    </div>
  );
}

function parseInlineFormatting(text: string, startKey: number, highlight: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let key = startKey;
  
  // Combined regex for all patterns we want to handle
  // Order matters: bold (**) before italic (*)
  // Also match CFR references: § XX.XX or Part XX
  // Special case: *Term* followed by "means" should be bold (FAR definitions)
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*\s+means|\*[^*]+\*|§\s*\d+\.\d+[a-z]?|Part\s+\d+)/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      elements.push(<HighlightText key={key++} text={beforeText} query={highlight} />);
    }
    
    const matched = match[0];
    
    if (matched.startsWith('**') && matched.endsWith('**')) {
      // Bold text (explicit double asterisks)
      const content = matched.slice(2, -2);
      elements.push(
        <strong key={key++} className="font-semibold">
          <HighlightText text={content} query={highlight} />
        </strong>
      );
    } else if (matched.startsWith('*') && matched.includes('* means')) {
      // Definition pattern: *Term* means - render as BOLD (regulatory convention)
      // Extract just the term (without the " means" part which we'll add back as plain text)
      const termMatch = matched.match(/^\*([^*]+)\*\s+means$/);
      if (termMatch) {
        const term = termMatch[1];
        elements.push(
          <strong key={key++} className="font-semibold">
            <HighlightText text={term} query={highlight} />
          </strong>
        );
        elements.push(<HighlightText key={key++} text=" means" query={highlight} />);
      } else {
        elements.push(<HighlightText key={key++} text={matched} query={highlight} />);
      }
    } else if (matched.startsWith('*') && matched.endsWith('*')) {
      // Italic text (single asterisks, not followed by "means")
      const content = matched.slice(1, -1);
      elements.push(
        <em key={key++} className="italic">
          <HighlightText text={content} query={highlight} />
        </em>
      );
    } else if (matched.startsWith('§')) {
      // Section reference: § XX.XX
      const sectionMatch = matched.match(/§\s*(\d+)\.(\d+[a-z]?)/);
      if (sectionMatch) {
        const part = sectionMatch[1];
        const section = `${sectionMatch[1]}.${sectionMatch[2]}`;
        elements.push(
          <Link 
            key={key++} 
            to={`/far/${part}#${section}`}
            className="text-blue-600 underline underline-offset-2 dark:text-blue-400"
          >
            <HighlightText text={matched} query={highlight} />
          </Link>
        );
      } else {
        elements.push(<HighlightText key={key++} text={matched} query={highlight} />);
      }
    } else if (matched.toLowerCase().startsWith('part')) {
      // Part reference: Part XX
      const partMatch = matched.match(/Part\s+(\d+)/i);
      if (partMatch) {
        const part = partMatch[1];
        elements.push(
          <Link 
            key={key++} 
            to={`/far/${part}`}
            className="text-blue-600 underline underline-offset-2 dark:text-blue-400"
          >
            <HighlightText text={matched} query={highlight} />
          </Link>
        );
      } else {
        elements.push(<HighlightText key={key++} text={matched} query={highlight} />);
      }
    }
    
    lastIndex = match.index + matched.length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(
      <HighlightText key={key++} text={text.slice(lastIndex)} query={highlight} />
    );
  }
  
  return elements;
}

/**
 * Simpler version that just handles bold/italic without links
 * Useful for places where we don't want navigation
 */
export function FormattedText({ text, className = '', highlight = '' }: FormattedContentProps) {
  const elements: React.ReactNode[] = [];
  let key = 0;
  
  // Handle bold, italic, and definition patterns (*Term* means)
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*\s+means|\*[^*]+\*)/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(
        <HighlightText key={key++} text={text.slice(lastIndex, match.index)} query={highlight} />
      );
    }
    
    const matched = match[0];
    
    if (matched.startsWith('**') && matched.endsWith('**')) {
      // Explicit bold
      const content = matched.slice(2, -2);
      elements.push(
        <strong key={key++} className="font-semibold">
          <HighlightText text={content} query={highlight} />
        </strong>
      );
    } else if (matched.startsWith('*') && matched.includes('* means')) {
      // Definition pattern: *Term* means - render term as BOLD
      const termMatch = matched.match(/^\*([^*]+)\*\s+means$/);
      if (termMatch) {
        const term = termMatch[1];
        elements.push(
          <strong key={key++} className="font-semibold">
            <HighlightText text={term} query={highlight} />
          </strong>
        );
        elements.push(<HighlightText key={key++} text=" means" query={highlight} />);
      } else {
        elements.push(<HighlightText key={key++} text={matched} query={highlight} />);
      }
    } else if (matched.startsWith('*') && matched.endsWith('*')) {
      // Italic (single asterisks, not a definition)
      const content = matched.slice(1, -1);
      elements.push(
        <em key={key++} className="italic">
          <HighlightText text={content} query={highlight} />
        </em>
      );
    }
    
    lastIndex = match.index + matched.length;
  }
  
  if (lastIndex < text.length) {
    elements.push(
      <HighlightText key={key++} text={text.slice(lastIndex)} query={highlight} />
    );
  }
  
  return <span className={className}>{elements}</span>;
}
