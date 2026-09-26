import { describe, expect, it } from 'vitest';
import {
  bulletList,
  codeLines,
  consecutivePairs,
  handbook,
  hasBrokenCharacter,
  numberedSentences,
  table,
} from '../__fixtures__/fixtures.js';
import { buildEmbeddingText } from '../header.js';
import { DEFAULT_CHUNKER_OPTIONS, type TextChunk } from '../types.js';
import { chunkMarkdown } from './markdown.js';

const TITLE = 'Northwind handbook';
const { maxChars, overlapChars } = DEFAULT_CHUNKER_OPTIONS;

function chunk(content: string, title = TITLE): TextChunk[] {
  return chunkMarkdown({ title, content });
}

function sections(chunks: readonly TextChunk[]): [string, string][] {
  return chunks.map((c) => [c.headingPath, c.content]);
}

function sentenceNumbers(text: string): number[] {
  return [...text.matchAll(/Sentence (\d+) /g)].map((match) => Number(match[1]));
}

describe('chunkMarkdown', () => {
  it('splits a handbook into one chunk per section, with heading paths (golden)', () => {
    expect(sections(chunk(handbook))).toEqual([
      [
        '',
        'Northwind Labs keeps its internal policies in this handbook. Ask People Ops if anything is unclear.',
      ],
      [
        'Employee handbook > Leave policy > Annual leave',
        'Full-time employees get 25 days of paid annual leave per calendar year. Unused days carry over until 31 March of the next year.',
      ],
      [
        'Employee handbook > Leave policy > Parental leave',
        'Birth parents get 16 weeks of fully paid leave. Other parents get 8 weeks.\n\n' +
          '- Leave can start up to 4 weeks before the due date.\n' +
          '- It can be split into two blocks.',
      ],
      [
        'Employee handbook > Expenses > Travel',
        'Book travel through the portal. Economy class for flights under 6 hours.\n\n' +
          '| Item             | Limit   | Code      |\n' +
          '| ---------------- | ------- | --------- |\n' +
          '| Hotel, per night | 180 EUR | EXP-HOTEL |\n' +
          '| Meals, per day   | 45 EUR  | EXP-MEAL  |',
      ],
      [
        'Employee handbook > Expenses > Submitting a claim',
        'Run the CLI from the finance repository:\n\n' +
          '```bash\nnpx expenses submit --receipt ./receipt.pdf --code EXP-MEAL\n```\n\n' +
          'Claims are paid with the next payroll.',
      ],
      ['Employee handbook > Contact', 'Email people-ops@northwind.example.'],
    ]);
  });

  describe('the hard limit, header included', () => {
    const pathological = [
      { name: 'the handbook', title: TITLE, content: handbook },
      { name: 'a 10,000-character paragraph', title: TITLE, content: numberedSentences(200) },
      {
        name: 'a 5,000-character code block',
        title: TITLE,
        content: `# Setup\n\n\`\`\`ts\n${codeLines(120)}\n\`\`\``,
      },
      { name: 'a 300-row table', title: TITLE, content: `# Rates\n\n${table(300)}` },
      { name: 'a 200-item list', title: TITLE, content: `# Checklist\n\n${bulletList(200)}` },
      { name: 'a 10,000-character word', title: TITLE, content: 'x'.repeat(10_000) },
      { name: '5,000 emoji without spaces', title: TITLE, content: '\u{1F600}'.repeat(5_000) },
      {
        name: 'a 1,500-character title',
        title: 'T'.repeat(1_500),
        content: `${handbook}\n\n${numberedSentences(60)}`,
      },
      {
        name: 'a 3,000-character heading',
        title: TITLE,
        content: `# ${'Heading '.repeat(375)}\n\n${numberedSentences(60)}`,
      },
    ];

    it('has inputs as big as they claim', () => {
      expect(numberedSentences(200).length).toBeGreaterThanOrEqual(10_000);
      expect(codeLines(120).length).toBeGreaterThanOrEqual(5_000);
    });

    it.each(pathological)('holds for $name', ({ title, content }) => {
      const chunks = chunkMarkdown({ title, content });
      expect(chunks.length).toBeGreaterThan(0);
      for (const c of chunks) {
        expect(buildEmbeddingText(title, c.headingPath, c.content).length).toBeLessThanOrEqual(
          maxChars,
        );
        expect(c.content).toBe(c.content.trim());
        expect(c.content).not.toBe('');
        expect(hasBrokenCharacter(c.content)).toBe(false);
      }
    });

    it('cuts a pathological heading so the header leaves room for content', () => {
      const chunks = chunk(`# ${'Heading '.repeat(375)}\n\nShort body.`);
      const headingPath = chunks[0]?.headingPath ?? '';
      expect(headingPath.endsWith('…')).toBe(true);
      expect(`${TITLE} > ${headingPath}`.length).toBeLessThanOrEqual(maxChars / 2);
      expect(chunks.map((c) => c.content)).toEqual(['Short body.']);
    });

    it('rejects a title that leaves no room for content', () => {
      expect(() => chunk('Some content.', 'T'.repeat(maxChars))).toThrow(RangeError);
    });

    it('rejects invalid options', () => {
      expect(() => chunkMarkdown({ title: TITLE, content: 'x' }, { targetChars: 0 })).toThrow(
        RangeError,
      );
      expect(() => chunkMarkdown({ title: TITLE, content: 'x' }, { overlapChars: -1 })).toThrow(
        RangeError,
      );
    });
  });

  describe('heading paths', () => {
    it('gives text before the first heading an empty heading path', () => {
      expect(sections(chunk('Intro text.\n\n# First\n\nBody.'))).toEqual([
        ['', 'Intro text.'],
        ['First', 'Body.'],
      ]);
    });

    it('follows nested headings and pops back up on a higher one', () => {
      const markdown = '# A\n\n## B\n\n### C\n\nc\n\n## D\n\nd\n\n# E\n\ne';
      expect(chunk(markdown).map((c) => c.headingPath)).toEqual(['A > B > C', 'A > D', 'E']);
    });

    it('handles skipped heading levels', () => {
      const markdown = '# A\n\n### C\n\nc\n\n## B\n\nb';
      expect(chunk(markdown).map((c) => c.headingPath)).toEqual(['A > C', 'A > B']);
    });

    it('strips inline markdown from headings', () => {
      const markdown =
        '## **Leave** `policy` for [parents](https://example.com) <b>now</b>\n\ntext';
      expect(chunk(markdown).map((c) => c.headingPath)).toEqual(['Leave policy for parents now']);
    });

    it('supports setext headings', () => {
      expect(sections(chunk('Policies\n========\n\nBody.'))).toEqual([['Policies', 'Body.']]);
    });
  });

  describe('sections', () => {
    it('produces no chunk for a heading without a body', () => {
      const markdown = '# Title\n\n## Empty\n\n---\n\n## Filled\n\nBody.';
      expect(sections(chunk(markdown))).toEqual([['Title > Filled', 'Body.']]);
    });

    it('never merges two sections, however small', () => {
      expect(sections(chunk('# A\n\nFirst.\n\n# B\n\nSecond.'))).toEqual([
        ['A', 'First.'],
        ['B', 'Second.'],
      ]);
    });

    it('merges the blocks of a section up to targetChars', () => {
      const paragraph = (n: number): string => `Paragraph ${n} `.padEnd(299, 'a') + '.';
      const markdown = `# Notes\n\n${[1, 2, 3, 4, 5].map(paragraph).join('\n\n')}`;
      const chunks = chunkMarkdown({ title: TITLE, content: markdown }, { overlapChars: 0 });
      // Three 300-character paragraphs make 904 characters; a fourth would make 1,206.
      expect(chunks.map((c) => c.content)).toEqual([
        [1, 2, 3].map(paragraph).join('\n\n'),
        [4, 5].map(paragraph).join('\n\n'),
      ]);
    });

    it('chunks plain text without headings as paragraphs', () => {
      expect(sections(chunk('First paragraph.\n\nSecond paragraph.'))).toEqual([
        ['', 'First paragraph.\n\nSecond paragraph.'],
      ]);
    });
  });

  describe('code blocks and tables', () => {
    it('keeps a code block whole when it fits, even above targetChars', () => {
      const code = `\`\`\`ts\n${codeLines(35)}\n\`\`\``;
      expect(code.length).toBeGreaterThan(DEFAULT_CHUNKER_OPTIONS.targetChars);
      const chunks = chunk(`# Setup\n\n${numberedSentences(10)}\n\n${code}`);
      expect(chunks.some((c) => c.content.includes(code))).toBe(true);
      for (const c of chunks) expect(c.content.split('```').length % 2).toBe(1); // fences paired
    });

    it('keeps a one-line intro with the big block it introduces', () => {
      const code = `\`\`\`ts\n${codeLines(35)}\n\`\`\``;
      expect(chunk(`# Setup\n\nInstall first:\n\n${code}`).map((c) => c.content)).toEqual([
        `Install first:\n\n${code}`,
      ]);
    });

    it('keeps a table whole when it fits', () => {
      const rates = table(30);
      const chunks = chunk(`# Rates\n\nCurrent rates:\n\n${rates}\n\nReviewed yearly.`);
      expect(chunks.some((c) => c.content.includes(rates))).toBe(true);
    });

    it('rewrites indented code as a fenced block', () => {
      const chunks = chunk('# Build\n\nRun this:\n\n    npm run build\n    npm test\n');
      expect(chunks.map((c) => c.content)).toEqual([
        'Run this:\n\n```\nnpm run build\nnpm test\n```',
      ]);
    });

    it('splits an oversized code block by lines, re-opening and closing the fence', () => {
      const code = codeLines(120);
      const chunks = chunk(`# Setup\n\n\`\`\`ts\n${code}\n\`\`\``);
      expect(chunks.length).toBeGreaterThan(1);
      for (const c of chunks) {
        expect(c.content.startsWith('```ts\n')).toBe(true);
        expect(c.content.endsWith('\n```')).toBe(true);
      }
      const bodies = chunks.map((c) => c.content.slice('```ts\n'.length, -'\n```'.length));
      expect(bodies.join('\n')).toBe(code); // every line once, in order, indentation kept
    });

    it('splits an oversized table by rows and repeats the header rows in every piece', () => {
      const rates = table(300);
      const [headerRow = '', delimiterRow = '', ...rows] = rates.split('\n');
      const chunks = chunk(`# Rates\n\n${rates}`);
      expect(chunks.length).toBeGreaterThan(1);
      const seenRows: string[] = [];
      for (const c of chunks) {
        const [first, second, ...body] = c.content.split('\n');
        expect([first, second]).toEqual([headerRow, delimiterRow]);
        seenRows.push(...body);
      }
      expect(seenRows).toEqual(rows);
    });
  });

  describe('oversized prose and overlap', () => {
    it('splits a huge paragraph by sentences, carrying the last sentences over', () => {
      const chunks = chunk(`# Policy\n\n${numberedSentences(200)}`);
      expect(chunks.length).toBeGreaterThan(5);

      for (const [previous, next] of consecutivePairs(chunks)) {
        const before = sentenceNumbers(previous.content);
        const after = sentenceNumbers(next.content);
        const lastBefore = before.at(-1) ?? 0;
        const overlapCount = after.indexOf(lastBefore + 1);
        // The next chunk starts with whole sentences that end the previous one...
        expect(overlapCount).toBeGreaterThan(0);
        expect(after.slice(0, overlapCount)).toEqual(before.slice(-overlapCount));
        // ...and they fit in overlapChars.
        const overlapText = next.content.slice(
          0,
          next.content.indexOf(`Sentence ${lastBefore + 1} `),
        );
        expect(overlapText.trim().length).toBeLessThanOrEqual(overlapChars);
      }
      const covered = new Set(chunks.flatMap((c) => sentenceNumbers(c.content)));
      expect(covered.size).toBe(200);
    });

    it('splits an oversized list between items, never inside one', () => {
      const list = bulletList(80);
      const items = new Set(list.split('\n'));
      const chunks = chunk(`# Checklist\n\n${list}`);
      expect(chunks.length).toBeGreaterThan(1);
      const seen = chunks.flatMap((c) => c.content.split('\n'));
      for (const line of seen) expect(items.has(line)).toBe(true);
      expect(new Set(seen)).toEqual(items);
    });

    it('cuts text without any sentence or word break into pieces that add up to it', () => {
      const word = 'x'.repeat(10_000);
      expect(
        chunk(word)
          .map((c) => c.content)
          .join(''),
      ).toBe(word);
    });

    it('adds no overlap across a heading', () => {
      const markdown = `# First\n\n${numberedSentences(60)}\n\n# Second\n\nThe second section starts here.`;
      const chunks = chunk(markdown);
      expect(chunks.filter((c) => c.headingPath === 'First').length).toBeGreaterThan(1);
      expect(sections(chunks.filter((c) => c.headingPath === 'Second'))).toEqual([
        ['Second', 'The second section starts here.'],
      ]);
    });

    it('adds no overlap after a code block, only after prose', () => {
      const code = `\`\`\`ts\n${codeLines(24)}\n\`\`\``;
      const prose = numberedSentences(18);
      const codeFirst = chunk(`# Mixed\n\n${code}\n\n${prose}`).map((c) => c.content);
      expect(codeFirst).toEqual([code, prose]);

      const proseFirst = chunk(`# Mixed\n\n${prose}\n\n${code}`).map((c) => c.content);
      expect(proseFirst).toHaveLength(2);
      expect(proseFirst[1]?.startsWith('Sentence 16 ')).toBe(true);
      expect(proseFirst[1]?.endsWith(`\n\n${code}`)).toBe(true);
    });
  });

  describe('output', () => {
    it('numbers chunks from 0 and estimates their tokens', () => {
      const chunks = chunk(`${handbook}\n\n${numberedSentences(100)}`);
      expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
      for (const c of chunks) expect(c.tokenEstimate).toBe(Math.ceil(c.content.length / 4));
    });

    it('treats CRLF line endings like LF', () => {
      expect(chunk(handbook.replace(/\n/g, '\r\n'))).toEqual(chunk(handbook));
    });

    it('is deterministic', () => {
      const markdown = `${handbook}\n\n# Long\n\n${numberedSentences(120)}\n\n${table(120)}`;
      expect(chunk(markdown)).toEqual(chunk(markdown));
    });

    it('returns no chunks for empty or blank content', () => {
      expect(chunk('')).toEqual([]);
      expect(chunk('  \n\n \t')).toEqual([]);
      expect(chunk('# Only a heading')).toEqual([]);
    });
  });
});
