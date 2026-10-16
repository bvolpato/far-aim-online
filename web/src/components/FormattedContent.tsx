import React from 'react';
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
  const elements = parseContent(displayText, highlight, tableCaption);
  
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
      .flatMap(line => line.split('|'))
      .map(cell => cell.trim())
      .filter(Boolean);
  }

  return trimmed
    .split(/\s{2,}/)
    .map(cell => cell.trim())
    .filter(Boolean);
}

function RawTable({ table, highlight, caption }: { table: RawTable; highlight: string; caption: string }) {
  const rows = table.rows.length > 0 ? table.rows : [table.headers];
  const headers = table.rows.length > 0 ? table.headers : [];

  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border">
        <caption className="sr-only">{caption}</caption>
        {headers.length > 0 && (
          <thead className="bg-muted/60">
            <tr>
              {headers.map((header, index) => (
                <th
                  key={index}
                  scope="col"
                  className="px-3 py-2 text-left font-semibold text-foreground"
                >
                  <HighlightText text={header} query={highlight} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-border bg-card">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 align-top text-muted-foreground">
                  <HighlightText text={cell} query={highlight} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
