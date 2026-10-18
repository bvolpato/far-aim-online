import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FormattedContent } from './FormattedContent';

function render(text: string, highlight = '', stripTableBlocks = false) {
  return renderToStaticMarkup(
    <StaticRouter location="/">
      <FormattedContent
        text={text}
        highlight={highlight}
        stripTableBlocks={stripTableBlocks}
      />
    </StaticRouter>
  );
}

describe('FormattedContent', () => {
  it('renders FAR references as internal links', () => {
    const html = render('See § 61.113 and Part 91.');

    expect(html).toContain('href="/far/61#61.113"');
    expect(html).toContain('href="/far/91"');
  });

  it('renders regulatory definition terms as bold text', () => {
    const html = render('*Aircraft* means a device used for flight.');

    expect(html).toContain('<strong');
    expect(html).toContain('Aircraft');
    expect(html).toContain(' means');
  });

  it('highlights search terms inside formatted content', () => {
    const html = render('Night currency and cross-country time.', 'cross-country');

    expect(html).toContain('<mark');
    expect(html).toContain('cross-country');
  });

  it('can strip raw crawler table blocks when structured tables render separately', () => {
    const html = render('Intro\n\n[TABLE]\n| raw |\n[/TABLE]\n\nOutro', '', true);

    expect(html).toContain('Intro');
    expect(html).toContain('Outro');
    expect(html).not.toContain('[TABLE]');
    expect(html).not.toContain('raw');
  });

  it('renders raw crawler table blocks as HTML tables', () => {
    const html = render('Intro\n\n[TABLE]\n| Heading |\n\n| Value |\n[/TABLE]\n\nOutro');

    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('Heading');
    expect(html).toContain('<td');
    expect(html).toContain('Value');
    expect(html).not.toContain('[TABLE]');
  });

  it('splits raw crawler table cells separated by spacing', () => {
    const html = render('[TABLE]\nHeading  Other\n\nValue  Second\n[/TABLE]');

    expect(html).toContain('<th');
    expect(html).toContain('scope="col"');
    expect(html).toContain('Heading');
    expect(html).toContain('Other');
    expect(html).toContain('Value');
    expect(html).toContain('Second');
  });

  it('preserves empty table columns and treats escaped pipes as cell content', () => {
    const html = render(
      '[TABLE]\n| Hazard label | Class or division / 1 | Class or division / 2.1 |\n\n| 1 | Note 1 | Note 2 |\n\n| 2.1 |  | X |\n\n| 3 | Notes include \\| as data | |\n[/TABLE]'
    );
    const body = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
      [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) => cell.replace(/<[^>]+>/g, ''))
    );

    expect(rows).toEqual([
      ['1', 'Note 1', 'Note 2'],
      ['2.1', '', 'X'],
      ['3', 'Notes include | as data', ''],
    ]);
  });

  it('renders single-group raw crawler tables', () => {
    const html = render('[TABLE]\nSingle  Row\n[/TABLE]');

    expect(html).toContain('<table');
    expect(html).toContain('<td');
    expect(html).toContain('Single');
    expect(html).toContain('Row');
  });

  it('keeps small tables intact and bounds large tables while retaining every source row', () => {
    const makeTable = (rowCount: number) => [
      '[TABLE]',
      '| Hazard | Detail |',
      ...Array.from({ length: rowCount }, (_, index) => `\n| Row ${index + 1} | Value ${index + 1} |`),
      '[/TABLE]',
    ].join('\n');
    const smallTable = render(makeTable(50));
    const largeTable = render(makeTable(51));
    const renderedRows = (html: string) => {
      const body = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
      return [...body.matchAll(/<tr\b/g)].length;
    };

    expect(renderedRows(smallTable)).toBe(50);
    expect(smallTable).not.toContain('Table pagination');
    expect(renderedRows(largeTable)).toBe(25);
    expect(largeTable).toContain('Rows 1–25 of 51');
    expect(largeTable).toContain('aria-rowcount="52"');
    expect(largeTable).toContain('aria-rowindex="26"');
    expect(largeTable).toContain('<noscript>');
    expect(largeTable).toContain('Read all table rows as plain text');
    expect(largeTable).toContain('Row 51');
    expect(largeTable).toMatch(/<button\b[^>]*disabled[^>]*>Next page<\/button>/);
  });

  it('adds an accessible caption to raw crawler tables', () => {
    const html = render('[TABLE]\n| Heading |\n\n| Value |\n[/TABLE]');

    expect(html).toContain('<caption class="sr-only">Reference table</caption>');
    expect(html).toContain('scope="col"');
  });
});
