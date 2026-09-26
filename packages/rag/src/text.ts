/** True for the first half of a UTF-16 surrogate pair (most emoji, for example). */
function isHighSurrogate(charCode: number): boolean {
  return charCode >= 0xd800 && charCode <= 0xdbff;
}

/**
 * Moves a cut position back by one when cutting there would split a surrogate pair,
 * so a cut never leaves a broken character. Positions and lengths are UTF-16 code
 * units, like String.length, which is also how every limit in this package is measured.
 */
export function safeCutIndex(text: string, index: number): number {
  const splitsPair =
    index > 0 && index < text.length && isHighSurrogate(text.charCodeAt(index - 1));
  return splitsPair ? index - 1 : index;
}

/** Shortens `text` to at most `maxChars` characters, marking the cut with an ellipsis. */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, safeCutIndex(text, maxChars - 1)).trimEnd()}…`;
}
