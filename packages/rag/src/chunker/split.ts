import { safeCutIndex } from '../text.js';

/*
 * Splitting helpers for text that does not fit in one chunk. Every splitter works on
 * "segments": consecutive pieces of the original text (sentences, words, lines, list
 * items) that concatenate back to it exactly, so packing them never loses or reorders text.
 */

// Unicode sentence boundaries (UAX #29) handle "e.g. this" and other scripts, and always
// break after a newline, which keeps list lines apart. A fixed locale gives the same
// chunks on every machine.
const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

export function segmentSentences(text: string): string[] {
  return Array.from(sentenceSegmenter.segment(text), (part) => part.segment);
}

/** Each word keeps the whitespace that follows it (the first also keeps any before it). */
export function segmentWords(text: string): string[] {
  return text.match(/\s*\S+\s*/g) ?? [];
}

/** Each line keeps its newline. */
export function segmentLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/**
 * Greedily packs segments into pieces of at most `limit` characters; a segment too long
 * on its own goes to `splitOversized`. Pieces keep leading whitespace (code indentation).
 */
export function packSegments(
  segments: readonly string[],
  limit: number,
  splitOversized: (segment: string) => string[],
): string[] {
  const pieces: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current.trim()) pieces.push(current.trimEnd());
    current = '';
  };

  for (const segment of segments) {
    if ((current + segment).trimEnd().length <= limit) {
      current += segment;
      continue;
    }
    flush();
    if (segment.trimEnd().length <= limit) current = segment;
    else pieces.push(...splitOversized(segment));
  }
  flush();
  return pieces;
}

/** Last resort for a single "word" (a URL, a hash) longer than the limit. */
export function hardCut(text: string, limit: number): string[] {
  const pieces: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.max(start + 1, safeCutIndex(text, Math.min(start + limit, text.length)));
    pieces.push(text.slice(start, end));
    start = end;
  }
  return pieces;
}

/** Prose is split between sentences, a sentence too long on its own between words. */
export function splitProse(text: string, limit: number): string[] {
  const splitSentence = (sentence: string): string[] =>
    packSegments(segmentWords(sentence), limit, (word) => hardCut(word.trim(), limit));
  return packSegments(segmentSentences(text.trim()), limit, splitSentence).map((piece) =>
    piece.trim(),
  );
}

/** Line-oriented text (code, tables, HTML) is split between lines, a single overlong line by cuts. */
export function splitLines(text: string, limit: number): string[] {
  return packSegments(segmentLines(text), limit, (line) => hardCut(line.trimEnd(), limit));
}

/**
 * Splits a code block or a table between lines and wraps every piece in the block's
 * frame, so each piece is valid markdown on its own: `head` is the opening fence or the
 * table's header and delimiter rows, `tail` the closing fence (empty for tables).
 */
export function splitFramed(head: string, body: string, tail: string, limit: number): string[] {
  const frameChars = head.length + 1 + (tail ? tail.length + 1 : 0);
  // Repeating a frame that takes most of the room would leave pieces that are mostly
  // frame; such a block is cut into plain lines instead.
  if (frameChars > limit / 2) {
    return splitLines([head, body, tail].filter(Boolean).join('\n'), limit);
  }
  return splitLines(body, limit - frameChars).map((part) =>
    [head, part, tail].filter(Boolean).join('\n'),
  );
}

/** The longest run of whole sentences at the end of `text` that fits in `maxChars`. */
export function trailingSentences(text: string, maxChars: number): string {
  let tail = '';
  for (const sentence of segmentSentences(text).reverse()) {
    const candidate = sentence + tail;
    if (candidate.trim().length > maxChars) break;
    tail = candidate;
  }
  return tail.trim();
}
