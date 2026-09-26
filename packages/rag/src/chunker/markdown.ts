import { Lexer, type MarkedToken, type Token, type Tokens } from 'marked';
import { buildChunkHeader } from '../header.js';
import { truncateText } from '../text.js';
import { type Chunker, type ChunkerOptions } from '../types.js';
import { contentBudget, normalizeNewlines, resolveChunkerOptions, toTextChunks } from './common.js';
import { packSegments, splitFramed, splitLines, splitProse, trailingSentences } from './split.js';

/**
 * Structure-aware markdown chunker.
 *
 * 1. The marked lexer turns the document into top-level blocks. Every heading opens a new
 *    section, and its heading path ("Leave policy > Parental leave") travels with each chunk.
 * 2. Within a section, whole blocks are merged until the next one would pass targetChars
 *    (a chunk shorter than overlapChars also takes the next block, within the hard limit).
 *    Sections are never merged, so a chunk is always about one topic.
 * 3. A block that is too big for the hard limit on its own is split at the most natural
 *    boundary its type allows: list items, then sentences, then words for prose; lines for
 *    code and tables, repeating the fence or the header rows so each piece stays valid.
 * 4. When a section needs several chunks, each chunk after the first starts with the last
 *    sentences of the previous one, so a fact cut at a boundary is findable from both sides.
 *
 * The hard limit includes the header: buildEmbeddingText(title, headingPath, content)
 * never exceeds maxChars, because the embedding model rejects oversized input.
 */
export const chunkMarkdown: Chunker = (input, options) => {
  const resolved = resolveChunkerOptions(options);
  const drafts = parseSections(normalizeNewlines(input.content)).flatMap((section) => {
    const headingPath = fitHeadingPath(input.title, section.headingPath, resolved.maxChars);
    return chunkSection(section.blocks, input.title, headingPath, resolved).map((content) => ({
      headingPath,
      content,
    }));
  });
  return toTextChunks(drafts);
};

/** A top-level markdown block, with what is needed to split it if it is too big. */
type Block =
  | { kind: 'prose'; text: string }
  | { kind: 'list'; text: string; items: string[] }
  | { kind: 'code'; text: string; openingFence: string; code: string; closingFence: string }
  | { kind: 'table'; text: string; headerRows: string; bodyRows: string }
  | { kind: 'html'; text: string };

interface Section {
  headingPath: string;
  blocks: Block[];
}

/** A block, or a part of a split block, small enough to go into a chunk. */
interface Piece {
  text: string;
  /** Pieces of the same block are joined with a line break, pieces of different blocks with a blank line. */
  blockIndex: number;
  /** Only prose lends its last sentences as overlap (see overlapPiece). */
  isProse: boolean;
}

function parseSections(markdown: string): Section[] {
  const headings: { depth: number; text: string }[] = [];
  let current: Section = { headingPath: '', blocks: [] };
  const sections = [current];

  // marked's Token type also admits tokens from extensions; none are registered here.
  for (const token of Lexer.lex(markdown) as MarkedToken[]) {
    if (token.type === 'heading') {
      while ((headings.at(-1)?.depth ?? 0) >= token.depth) headings.pop();
      headings.push({ depth: token.depth, text: inlineText(token.tokens) });
      current = { headingPath: joinHeadings(headings), blocks: [] };
      sections.push(current);
      continue;
    }
    const block = toBlock(token);
    if (block) current.blocks.push(block);
  }
  // A heading with no body of its own produces no chunk; its text lives on in the
  // heading paths of its subsections.
  return sections.filter((section) => section.blocks.length > 0);
}

function joinHeadings(headings: readonly { text: string }[]): string {
  return headings
    .map((heading) => heading.text)
    .filter((text) => text !== '')
    .join(' > ');
}

/** Heading text without inline markdown: "**Leave** `policy`" becomes "Leave policy". */
function inlineText(tokens: readonly Token[]): string {
  return collectInlineText(tokens).replace(/\s+/g, ' ').trim();
}

function collectInlineText(tokens: readonly Token[]): string {
  return (tokens as MarkedToken[])
    .map((token) => {
      switch (token.type) {
        case 'text':
        case 'codespan':
        case 'escape':
          return token.text;
        case 'strong':
        case 'em':
        case 'del':
        case 'link':
        case 'image':
          return collectInlineText(token.tokens);
        case 'br':
          return ' ';
        default:
          return ''; // inline HTML tags carry no words
      }
    })
    .join('');
}

function toBlock(token: MarkedToken): Block | null {
  const text = token.raw.trim();
  if (!text) return null;
  switch (token.type) {
    case 'hr':
    case 'def':
      return null; // thematic breaks and link definitions carry no prose
    case 'code':
      return codeBlock(token, text);
    case 'table':
      return tableBlock(text);
    case 'list':
      return { kind: 'list', text, items: token.items.map((item) => item.raw) };
    case 'html':
      return { kind: 'html', text };
    default:
      return { kind: 'prose', text }; // paragraphs, blockquotes and any other block
  }
}

function codeBlock(token: Tokens.Code, text: string): Block {
  if (token.codeBlockStyle === 'indented') {
    // Trimming would strip the indentation that makes this code, so indented code is
    // rewritten as a fenced block, which also gives it fences to repeat if it is split.
    const code = token.text.replace(/\n+$/, '');
    const fence = fenceFor(code);
    const fenced = `${fence}\n${code}\n${fence}`;
    return { kind: 'code', text: fenced, openingFence: fence, code, closingFence: fence };
  }
  const openingFence = text.split('\n', 1)[0] ?? '```'; // e.g. "```ts"
  const closingFence = /^[`~]+/.exec(openingFence)?.[0] ?? '```';
  return { kind: 'code', text, openingFence, code: token.text, closingFence };
}

/** A backtick fence longer than any backtick run inside the code, so the code cannot close it. */
function fenceFor(code: string): string {
  const longestRun = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longestRun + 1));
}

function tableBlock(text: string): Block {
  const lines = text.split('\n');
  return {
    kind: 'table',
    text,
    headerRows: lines.slice(0, 2).join('\n'), // the header row and the |---| delimiter row
    bodyRows: lines.slice(2).join('\n'),
  };
}

/**
 * A pathological heading (hundreds of characters, or a very deep trail) must not eat the
 * room for content, so the header may use at most half of maxChars; a longer heading
 * path is cut.
 */
function fitHeadingPath(title: string, headingPath: string, maxChars: number): string {
  const maxHeaderChars = Math.floor(maxChars / 2);
  if (buildChunkHeader(title, headingPath).length <= maxHeaderChars) return headingPath;
  const roomForPath = maxHeaderChars - `${title} > `.length; // the header is "{title} > {path}"
  return roomForPath > 1 ? truncateText(headingPath, roomForPath) : '';
}

function chunkSection(
  blocks: readonly Block[],
  title: string,
  headingPath: string,
  options: ChunkerOptions,
): string[] {
  const budget = contentBudget(title, headingPath, options.maxChars);
  const target = Math.min(options.targetChars, budget);
  const pieces = blocks.flatMap((block, blockIndex) => toPieces(block, blockIndex, budget, target));
  return groupPieces(pieces, target, budget, options.overlapChars).map((group) =>
    joinPieces(group).trim(),
  );
}

function toPieces(block: Block, blockIndex: number, budget: number, target: number): Piece[] {
  const isProse = block.kind === 'prose' || block.kind === 'list';
  // A block that fits the hard limit is kept whole even when it is bigger than the
  // target: a complete code example or table is worth more than two halves.
  const texts = block.text.length <= budget ? [block.text] : splitBlock(block, target);
  return texts.map((text) => ({ text, blockIndex, isProse }));
}

function splitBlock(block: Block, limit: number): string[] {
  switch (block.kind) {
    case 'prose':
      return splitProse(block.text, limit);
    case 'list':
      // Between items first; an item too big on its own is split like any prose.
      return packSegments(block.items, limit, (item) => splitProse(item, limit)).map((piece) =>
        piece.trim(),
      );
    case 'code':
      return splitFramed(block.openingFence, block.code, block.closingFence, limit);
    case 'table':
      return splitFramed(block.headerRows, block.bodyRows, '', limit);
    case 'html':
      return splitLines(block.text, limit);
  }
}

/**
 * Merges consecutive pieces into chunks of at most `target` characters. A new chunk in
 * the same section starts with the previous chunk's last sentences when they fit.
 */
function groupPieces(
  pieces: readonly Piece[],
  target: number,
  budget: number,
  overlapChars: number,
): Piece[][] {
  const groups: Piece[][] = [];
  let current: Piece[] = [];
  for (const piece of pieces) {
    const mergedLength = joinPieces([...current, piece]).length;
    // A chunk no longer than the overlap is too small to stand alone (think of a one-line
    // intro before a big code block), and the next chunk would repeat it whole anyway,
    // so it takes the next piece too, as long as the hard limit allows.
    const tooSmallToStandAlone =
      joinPieces(current).length <= overlapChars && mergedLength <= budget;
    if (current.length === 0 || mergedLength <= target || tooSmallToStandAlone) {
      current.push(piece);
      continue;
    }
    groups.push(current);
    const overlap = overlapPiece(current, overlapChars);
    current = overlap && joinPieces([overlap, piece]).length <= budget ? [overlap, piece] : [piece];
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * The trailing sentences of a chunk, to repeat at the start of the next chunk. This only
 * runs inside one section: overlap across a heading would mix two topics in one chunk.
 * Only prose lends overlap, because the tail of a code block or a table would leave a
 * fence or a table fragment that the next chunk cannot close.
 */
function overlapPiece(group: readonly Piece[], overlapChars: number): Piece | null {
  const last = group.at(-1);
  if (!last?.isProse || overlapChars === 0) return null;
  const text = trailingSentences(last.text, overlapChars);
  return text ? { ...last, text } : null;
}

function joinPieces(pieces: readonly Piece[]): string {
  let joined = '';
  let previous: Piece | undefined;
  for (const piece of pieces) {
    if (previous) joined += previous.blockIndex === piece.blockIndex ? '\n' : '\n\n';
    joined += piece.text;
    previous = piece;
  }
  return joined;
}
