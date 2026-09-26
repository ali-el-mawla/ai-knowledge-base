import { describe, expect, it } from 'vitest';
import { escapeLikePattern, ilikeAnyFilter, quoteFilterValue } from './postgrest-filters.js';

describe('escapeLikePattern', () => {
  it('escapes LIKE wildcards so they match literally', () => {
    expect(escapeLikePattern('50%_off')).toBe('50\\%\\_off');
  });

  it('escapes the escape character itself', () => {
    expect(escapeLikePattern('C:\\temp')).toBe('C:\\\\temp');
  });

  it('turns * into a single-character wildcard (PostgREST has no escape for it)', () => {
    expect(escapeLikePattern('a*b')).toBe('a_b');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLikePattern('refund policy')).toBe('refund policy');
  });
});

describe('quoteFilterValue', () => {
  it('wraps the value in double quotes so separators are data', () => {
    expect(quoteFilterValue('a,b (c).d:e')).toBe('"a,b (c).d:e"');
  });

  it('escapes double quotes and backslashes inside the quotes', () => {
    expect(quoteFilterValue('say "hi" \\ bye')).toBe('"say \\"hi\\" \\\\ bye"');
  });
});

describe('ilikeAnyFilter', () => {
  it('builds one ilike condition per column around a contains pattern', () => {
    expect(ilikeAnyFilter(['title', 'content'], 'refund')).toBe(
      'title.ilike."%refund%",content.ilike."%refund%"',
    );
  });

  it('escapes for LIKE first, then for the PostgREST grammar', () => {
    // User text: 50%, (EU)   ->   LIKE: 50\%, (EU)   ->   quoted: "%50\\%, (EU)%"
    expect(ilikeAnyFilter(['title'], '50%, (EU)')).toBe('title.ilike."%50\\\\%, (EU)%"');
  });

  it('cannot be broken out of with quotes, commas or parentheses', () => {
    const filter = ilikeAnyFilter(['title'], '"),id.neq.(x');
    expect(filter).toBe('title.ilike."%\\"),id.neq.(x%"');
    // Exactly one condition: the quote is escaped, so no new filter starts.
    expect(filter.match(/(^|,)[a-z_]+\.ilike\./g)).toHaveLength(1);
  });
});
