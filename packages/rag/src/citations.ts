/*
 * Citation markers as the answer prompt asks for them: [1], [2][3], [1, 2] and ranges
 * such as [2-4] (a hyphen or an en dash). Not citations: markdown links "[1](url)",
 * footnotes "[^1]", and anything inside inline code or a fenced code block.
 */

const NUMBER_OR_RANGE = String.raw`\d+(?:\s*[-–]\s*\d+)?`;
const MARKER = String.raw`\[\s*${NUMBER_OR_RANGE}(?:\s*,\s*${NUMBER_OR_RANGE})*\s*\](?!\()`;
const MARKERS = new RegExp(MARKER, 'g');
/** Adjacent markers ("[1][2]", "[1], [2]") are removed together. */
const MARKER_RUN = String.raw`${MARKER}(?:[ \t]*[,;]?[ \t]*${MARKER})*`;

/** A marker after text is removed with the spaces before it: "days [1]." becomes "days.". */
const MARKERS_AFTER_TEXT = new RegExp(String.raw`(?<=\S)[ \t]*${MARKER_RUN}`, 'g');
/** A marker at the start of a line is removed with the spaces after it; indentation stays. */
const MARKERS_AT_LINE_START = new RegExp(String.raw`^([ \t]*)${MARKER_RUN}[ \t]*`, 'gm');

// Code is split out first so "items[1]" in a snippet is never read as a citation.
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]+`)/;

/** Unique citation numbers found in `text`, sorted, keeping only 1..sourceCount. */
export function parseCitations(text: string, sourceCount: number): number[] {
  const found = new Set<number>();
  for (const prose of proseParts(text)) {
    for (const match of prose.matchAll(MARKERS)) {
      for (const number of markerNumbers(match[0], sourceCount)) found.add(number);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Removes citation markers and the spacing they leave behind. Used on earlier assistant
 * turns before they go back into a prompt: their numbers referred to the sources of
 * their own turn, and would point at the wrong sources now.
 */
export function stripCitations(text: string): string {
  return text
    .split(CODE)
    .map((part, index) => (isCode(index) ? part : removeMarkers(part)))
    .join('');
}

function removeMarkers(prose: string): string {
  return prose.replace(MARKERS_AFTER_TEXT, '').replace(MARKERS_AT_LINE_START, '$1');
}

/** Splitting on a pattern with one capture group alternates prose and code parts. */
function isCode(partIndex: number): boolean {
  return partIndex % 2 === 1;
}

function proseParts(text: string): string[] {
  return text.split(CODE).filter((_, index) => !isCode(index));
}

/** "[1, 3-5]" gives 1, 3, 4, 5; numbers outside 1..sourceCount are dropped. */
function markerNumbers(marker: string, sourceCount: number): number[] {
  const numbers: number[] = [];
  for (const part of marker.slice(1, -1).split(',')) {
    const [first = '', last = first] = part.split(/[-–]/);
    const from = Math.max(1, Number.parseInt(first, 10));
    // Capping at sourceCount keeps a stray "[1-99999]" from looping for nothing.
    const to = Math.min(sourceCount, Number.parseInt(last, 10));
    for (let number = from; number <= to; number += 1) numbers.push(number);
  }
  return numbers;
}
