import { describe, expect, it } from 'vitest';
import { normalizeRewrite, sameQuestion, TITLE_MAX_CHARS, titleFromQuestion } from './chat-text.js';

describe('titleFromQuestion', () => {
  it('keeps a short question as it is, with whitespace collapsed', () => {
    expect(titleFromQuestion('  How many\n vacation   days? ')).toBe('How many vacation days?');
  });

  it('cuts a long question on a word boundary, within the limit', () => {
    const title = titleFromQuestion(
      'What is the parental leave policy for employees who joined the company this year?',
    );
    expect(title).toBe('What is the parental leave policy for employees who joined…');
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX_CHARS);
  });

  it('cuts inside a very long word rather than losing most of the title', () => {
    const title = titleFromQuestion(`Explain ${'x'.repeat(100)}`);
    expect(title.length).toBe(TITLE_MAX_CHARS);
    expect(title.endsWith('…')).toBe(true);
  });

  it('never splits an emoji', () => {
    const title = titleFromQuestion(`${'a'.repeat(58)}😀 and more`);
    expect(title).toBe(`${'a'.repeat(58)}…`);
  });
});

describe('normalizeRewrite', () => {
  it.each([
    ['How many days?', 'How many days?'],
    ['  "How many days?"\n', 'How many days?'],
    ['Rewritten question: How many days?', 'How many days?'],
    ['Standalone query: “How many\ndays?”', 'How many days?'],
    ['   ', ''],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeRewrite(input)).toBe(expected);
  });
});

describe('sameQuestion', () => {
  it('ignores case and spacing only', () => {
    expect(sameQuestion('And part-timers?', ' and  PART-TIMERS? ')).toBe(true);
    expect(sameQuestion('And part-timers?', 'And contractors?')).toBe(false);
  });
});
