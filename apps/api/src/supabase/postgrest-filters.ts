/**
 * Helpers for building PostgREST filter strings from user input. `.or()` takes raw
 * filter syntax, so user text must be escaped twice: once for SQL `LIKE` (where `%`
 * and `_` are wildcards) and once for PostgREST's grammar (where `,` `(` `)` and `.`
 * are separators).
 */

/** Makes user text match literally inside a `LIKE` / `ILIKE` pattern (backslash is the escape). */
export function escapeLikePattern(text: string): string {
  return (
    text
      .replace(/[\\%_]/g, (char) => `\\${char}`)
      // PostgREST rewrites every `*` in a like pattern to `%` and offers no escape for it;
      // `_` (exactly one character) is the closest we can get to a literal asterisk.
      .replace(/\*/g, '_')
  );
}

/** Double-quotes a value for PostgREST's filter grammar, escaping `"` and `\`. */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

/**
 * An `.or()` filter matching rows where any of `columns` contains `term`,
 * case-insensitively. `ilikeAnyFilter(['title', 'content'], '50%')` matches "50% off"
 * but not "500 off".
 */
export function ilikeAnyFilter(columns: readonly string[], term: string): string {
  const pattern = quoteFilterValue(`%${escapeLikePattern(term)}%`);
  return columns.map((column) => `${column}.ilike.${pattern}`).join(',');
}
