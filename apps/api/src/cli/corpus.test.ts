import { describe, expect, it } from 'vitest';
import { tagsFromFileName, titleOf } from './corpus.js';

describe('tagsFromFileName', () => {
  it.each([
    ['customer-support-sla.md', ['support']],
    ['data-retention-and-privacy-policy.md', ['privacy', 'policy']],
    ['employee-handbook.md', ['hr', 'policy']],
    ['engineering-onboarding-guide.md', ['engineering', 'onboarding']],
    ['pricing-and-plans.md', ['pricing']],
    ['product-api-specification.md', ['product', 'engineering']],
    ['security-incident-response-runbook.md', ['security']],
    ['travel-and-expense-policy.md', ['finance', 'policy']],
  ])('%s -> %j', (fileName, tags) => {
    expect(tagsFromFileName(fileName)).toEqual(tags);
  });

  it('ignores words it has no tag for', () => {
    expect(tagsFromFileName('Meeting_Notes.md')).toEqual([]);
  });
});

describe('titleOf', () => {
  it('uses the first level-1 heading', () => {
    expect(titleOf('Intro line\n\n## Not this\n\n# Pricing and Plans #\n\n# Later', 'x.md')).toBe(
      'Pricing and Plans',
    );
  });

  it('falls back to the file name in words', () => {
    expect(titleOf('No heading here.', 'release-notes_2026.md')).toBe('Release notes 2026');
  });
});
