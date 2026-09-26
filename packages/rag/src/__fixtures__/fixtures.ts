import { readFileSync } from 'node:fs';

/** Test inputs, built so every sentence, line, row or word is unique and easy to find again. */

export const handbook = readFileSync(new URL('./handbook.md', import.meta.url), 'utf8');

/** One paragraph of distinct sentences, about 55 characters each. */
export function numberedSentences(count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `Sentence ${i + 1} explains one more detail of the policy.`,
  ).join(' ');
}

/** The body of a code block: distinct, indented lines of about 45 characters. */
export function codeLines(count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `  const value${i + 1} = compute(${i + 1}); // step ${i + 1}`,
  ).join('\n');
}

/** A markdown table with a header, a delimiter row and `rowCount` distinct rows. */
export function table(rowCount: number): string {
  const rows = Array.from(
    { length: rowCount },
    (_, i) => `| Item ${i + 1} | ${10 * (i + 1)} EUR | EXP-${1000 + i} |`,
  );
  return ['| Item | Limit | Code |', '| --- | --- | --- |', ...rows].join('\n');
}

/** A bullet list of distinct items, about 50 characters each. */
export function bulletList(count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `- Checklist item ${i + 1}: confirm the backup ran.`,
  ).join('\n');
}

/** Distinct words separated by spaces, line breaks and blank lines. */
export function distinctWords(count: number): string {
  return Array.from({ length: count }, (_, i) => {
    const separator = i % 13 === 12 ? '\n\n' : i % 7 === 6 ? '\n' : ' ';
    return `word${i + 1}${separator}`;
  })
    .join('')
    .trim();
}

/** True when a string contains half of a surrogate pair, i.e. a broken character. */
export function hasBrokenCharacter(text: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
}

/** [a, b], [b, c], ... for checking what carries over from one chunk to the next. */
export function consecutivePairs<T>(items: readonly T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 1; i < items.length; i += 1) {
    const previous = items[i - 1];
    const current = items[i];
    if (previous !== undefined && current !== undefined) pairs.push([previous, current]);
  }
  return pairs;
}
