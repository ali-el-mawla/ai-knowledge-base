export const TITLE_MAX_CHARS = 60;

/** A sidebar title from the first question: whitespace collapsed, cut on a word boundary. */
export function titleFromQuestion(question: string): string {
  const text = question.replace(/\s+/g, ' ').trim();
  if (text.length <= TITLE_MAX_CHARS) return text;
  const lastSpace = text.lastIndexOf(' ', TITLE_MAX_CHARS - 1);
  // Cut at a word unless that would lose more than half of the title.
  let end = lastSpace > TITLE_MAX_CHARS / 2 ? lastSpace : TITLE_MAX_CHARS - 1;
  // Never split a surrogate pair (an emoji, for example) in two.
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return `${text.slice(0, end).trimEnd()}…`;
}

// Labels small models sometimes put before the answer despite the prompt.
const LABEL = /^(?:standalone |rewritten |search )?(?:question|query)\s*:\s*/i;
const WRAPPING_QUOTES = /^(["'“‘])(.*)(["'”’])$/;

/** The rewrite model's output as a one-line query: label, wrapping quotes and extra whitespace removed. */
export function normalizeRewrite(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim().replace(LABEL, '');
  return oneLine.replace(WRAPPING_QUOTES, '$2').trim();
}

/** True when two questions differ only in case and spacing. */
export function sameQuestion(a: string, b: string): boolean {
  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();
  return normalize(a) === normalize(b);
}
