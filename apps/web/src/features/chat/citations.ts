/*
 * Citation markers, read exactly as the API reads them (packages/rag/src/citations.ts; the
 * web app does not depend on @repo/rag, so the regex is copied here and must stay in sync):
 * [1], [2][3], [1, 2] and ranges such as [2-4] (a hyphen or an en dash). Not citations:
 * markdown links "[1](url)", footnotes "[^1]", and anything inside inline or fenced code.
 */

const NUMBER_OR_RANGE = String.raw`\d+(?:\s*[-–]\s*\d+)?`;
const MARKER = String.raw`\[\s*${NUMBER_OR_RANGE}(?:\s*,\s*${NUMBER_OR_RANGE})*\s*\](?!\()`;
const MARKERS = new RegExp(MARKER, 'g');

// Code is split out first so "items[1]" in a snippet is never read as a citation.
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]+`)/;

export type CitationPart = { type: 'text'; value: string } | { type: 'marker'; value: string };

/**
 * Splits prose into plain text and citation markers, in order. Callers pass prose only
 * (the markdown renderer hands over text nodes, which never contain code).
 */
export function splitCitationMarkers(text: string): CitationPart[] {
  const parts: CitationPart[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKERS)) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) });
    parts.push({ type: 'marker', value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

/**
 * "[1, 3-5]" gives 1, 3, 4, 5 in reading order, without repeats; numbers outside
 * 1..sourceCount are dropped (capping also keeps a stray "[1-99999]" from looping).
 */
export function markerNumbers(marker: string, sourceCount: number): number[] {
  const numbers = new Set<number>();
  for (const part of marker.slice(1, -1).split(',')) {
    const [first = '', last = first] = part.split(/[-–]/);
    const from = Math.max(1, Number.parseInt(first, 10));
    const to = Math.min(sourceCount, Number.parseInt(last, 10));
    for (let number = from; number <= to; number += 1) numbers.add(number);
  }
  return [...numbers];
}

/** Unique citation numbers found in `text`, sorted, keeping only 1..sourceCount. */
export function parseCitations(text: string, sourceCount: number): number[] {
  const found = new Set<number>();
  const prose = text.split(CODE).filter((_, index) => index % 2 === 0);
  for (const part of prose) {
    for (const match of part.matchAll(MARKERS)) {
      for (const number of markerNumbers(match[0], sourceCount)) found.add(number);
    }
  }
  return [...found].sort((a, b) => a - b);
}
