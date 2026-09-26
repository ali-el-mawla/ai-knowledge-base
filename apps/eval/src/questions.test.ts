import { describe, expect, it } from 'vitest';
import { type CorpusDocument, extractTitle } from './corpus.js';
import { validateQuestions } from './questions.js';

const corpus: CorpusDocument[] = [
  {
    file: 'handbook.md',
    title: 'Handbook',
    content: '# Handbook\n\nPrimary carers get 18 weeks at full base pay.\n',
  },
  { file: 'pricing.md', title: 'Pricing', content: '# Pricing\n\n| PLN-GROWTH-24 | 449 USD |\n' },
];

const valid = {
  id: 'q01',
  question: 'How long is parental leave?',
  document: 'handbook.md',
  answer: '18 weeks at full base pay',
  type: 'paraphrase',
};

describe('validateQuestions', () => {
  it('accepts an answer copied verbatim from its document', () => {
    const result = validateQuestions([valid], corpus);
    expect(result.errors).toEqual([]);
    expect(result.questions).toEqual([valid]);
  });

  it('rejects an answer that is not in its document, even if it is in another', () => {
    const result = validateQuestions([{ ...valid, answer: '449 USD' }], corpus);
    expect(result.errors).toEqual(['q01: answer not found verbatim in handbook.md']);
    expect(result.questions).toEqual([]);
  });

  it('rejects duplicate ids, unknown types and unknown documents', () => {
    const result = validateQuestions(
      [valid, { ...valid, type: 'trivia' }, { ...valid, id: 'q02', document: 'nope.md' }],
      corpus,
    );
    expect(result.errors).toEqual([
      'q01: duplicate id',
      'q01: unknown type "trivia" (allowed: exact-code, table, nested-heading, ambiguous-term, code-block, paraphrase)',
      'q02: document "nope.md" not found in fixtures/corpus/',
    ]);
  });

  it('rejects a missing field and a non-array file', () => {
    expect(validateQuestions([{ ...valid, answer: '' }], corpus).errors).toEqual([
      'q01: "answer" must be a non-empty string',
    ]);
    expect(validateQuestions({}, corpus).errors).toHaveLength(1);
  });

  it('only warns about a weak span', () => {
    const result = validateQuestions([{ ...valid, answer: 'weeks' }], corpus);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(['q01: answer has 1 word(s), aim for 2 to 12']);
  });
});

describe('extractTitle', () => {
  it('reads the first level-1 heading', () => {
    expect(extractTitle('# Travel and Expense Policy\n\n## Limits\n')).toBe(
      'Travel and Expense Policy',
    );
  });

  it('ignores "# " lines inside fenced code blocks', () => {
    expect(extractTitle('```bash\n# Clone the repo\ngit clone x\n```\n\n# Real Title\n')).toBe(
      'Real Title',
    );
  });

  it('returns null without a level-1 heading', () => {
    expect(extractTitle('## Only a subheading\n')).toBeNull();
  });
});
