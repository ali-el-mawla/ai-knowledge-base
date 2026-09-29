import { safeCutIndex } from '../text.js';
import { type Chunker } from '../types.js';
import { contentBudget, normalizeNewlines, resolveChunkerOptions, toTextChunks } from './common.js';

/**
 * Fixed-size chunker, the evaluation baseline. It ignores structure: a window of
 * targetChars slides over the raw text, each new window starting overlapChars before the
 * previous one ended. Cuts fall on whitespace; only a word longer than the window is cut.
 * The hard limit (header included) is the same, so the comparison measures chunking only.
 */
export const chunkFixedSize: Chunker = (input, options) => {
  const { targetChars, maxChars, overlapChars } = resolveChunkerOptions(options);
  const text = normalizeNewlines(input.content).trim();
  const windowChars = Math.min(targetChars, contentBudget(input.title, '', maxChars));
  // With a long title the window shrinks; an overlap of more than half a window would
  // make each window advance by a word or two and repeat almost everything.
  const stepBackChars = Math.min(overlapChars, Math.floor(windowChars / 2));

  const contents: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = windowEnd(text, start, windowChars);
    contents.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = nextWindowStart(text, start, end, stepBackChars);
  }
  return toTextChunks(contents.map((content) => ({ headingPath: '', content })));
};

/** The window ends at the last whitespace that keeps it within `windowChars`. */
function windowEnd(text: string, start: number, windowChars: number): number {
  const limit = start + windowChars;
  if (limit >= text.length) return text.length;
  for (let index = limit; index > start; index -= 1) {
    if (isWhitespace(text[index])) return index;
  }
  // One word longer than the whole window: cut it (without breaking a character).
  return Math.max(start + 1, safeCutIndex(text, limit));
}

/**
 * Steps back overlapChars from the end of the window, then forward to the next word start,
 * so the overlap never begins mid-word. Always moves forward, so the loop terminates.
 */
function nextWindowStart(text: string, start: number, end: number, overlapChars: number): number {
  let next = Math.max(end - overlapChars, start + 1);
  while (next < end && !isWordStart(text, next)) next += 1;
  while (next < text.length && isWhitespace(text[next])) next += 1;
  return next;
}

function isWordStart(text: string, index: number): boolean {
  return !isWhitespace(text[index]) && isWhitespace(text[index - 1]);
}

function isWhitespace(char: string | undefined): boolean {
  return char !== undefined && /\s/.test(char);
}
