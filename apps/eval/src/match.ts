/**
 * Reduces markdown to comparable plain text. Chunk text is raw markdown, and a chunk
 * boundary can reflow it: a sentence may wrap onto a new line, a table cell keeps its
 * pipes, a phrase may sit inside `**bold**` or backticks. Both the chunk and the answer
 * go through the same reduction, so the comparison is about words, not formatting.
 */
export function normalizeForMatch(text: string): string {
  return text
    .replace(/\|/g, ' ') // table cell borders separate words
    .replace(/[*_`]/g, '') // emphasis and code markers
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * True when the chunk contains the whole answer span (after normalizing both), starting
 * and ending on word boundaries: "200 items" must not match inside "1200 items".
 */
export function containsAnswer(chunkContent: string, answer: string): boolean {
  const span = normalizeForMatch(answer);
  if (span === '') return false;
  const text = normalizeForMatch(chunkContent);
  for (let at = text.indexOf(span); at !== -1; at = text.indexOf(span, at + 1)) {
    const end = at + span.length;
    if (edgeIsFree(span[0], text[at - 1]) && edgeIsFree(span.at(-1), text[end])) return true;
  }
  return false;
}

/** A span edge that is a letter or digit must not be glued to another letter or digit. */
function edgeIsFree(spanEdge: string | undefined, neighbour: string | undefined): boolean {
  return !isWordChar(spanEdge) || !isWordChar(neighbour);
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}
