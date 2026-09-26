import { existsSync, readFileSync } from 'node:fs';
import { type CorpusDocument } from './corpus.js';

export const QUESTION_TYPES = [
  'exact-code',
  'table',
  'nested-heading',
  'ambiguous-term',
  'code-block',
  'paraphrase',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface Question {
  id: string;
  question: string;
  /** File name in fixtures/corpus/ that holds the answer. */
  document: string;
  /** A short span copied character for character from that document. */
  answer: string;
  type: QuestionType;
}

export interface QuestionSet {
  /** False when the real set is missing and the six format examples stand in for it. */
  isRealSet: boolean;
  file: string;
  questions: Question[];
  warnings: string[];
}

export interface Validation {
  questions: Question[];
  errors: string[];
  warnings: string[];
}

const FIELDS = ['id', 'question', 'document', 'answer', 'type'] as const;
type Field = (typeof FIELDS)[number];
const EM_DASH = String.fromCharCode(0x2014);

/** fixtures/questions.json when it exists, otherwise the template. Throws on any error. */
export function loadQuestions(
  paths: { questions: string; templateQuestions: string },
  corpus: readonly CorpusDocument[],
): QuestionSet {
  const isRealSet = existsSync(paths.questions);
  const file = isRealSet ? paths.questions : paths.templateQuestions;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${(error as Error).message}`);
  }
  const { questions, errors, warnings } = validateQuestions(raw, corpus);
  if (errors.length > 0) {
    throw new Error(
      [`${file} has ${errors.length} error(s):`, ...errors.map((line) => `  - ${line}`)].join('\n'),
    );
  }
  return { isRealSet, file, questions, warnings };
}

/**
 * The same checks as fixtures/verify-questions.mjs. Errors make a gold label unusable
 * (bad shape, duplicate id, unknown type or document, an answer not found verbatim);
 * warnings only flag a weak label (an ambiguous or oddly sized span).
 */
export function validateQuestions(raw: unknown, corpus: readonly CorpusDocument[]): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const questions: Question[] = [];
  if (!Array.isArray(raw) || raw.length === 0) {
    return { questions, errors: ['must be a non-empty JSON array of questions'], warnings };
  }

  const texts = new Map(corpus.map((doc) => [doc.file, doc.content]));
  const seenIds = new Set<string>();
  raw.forEach((entry: unknown, index) => {
    if (!isRecord(entry)) {
      errors.push(`entry #${index + 1}: must be an object`);
      return;
    }
    const label = isNonEmptyString(entry.id) ? entry.id : `entry #${index + 1}`;
    const missing = FIELDS.filter((field) => !isNonEmptyString(entry[field]));
    for (const field of missing) errors.push(`${label}: "${field}" must be a non-empty string`);
    if (missing.length > 0) return;
    const fields = entry as Record<Field, string>;
    const { id, question, document, answer, type } = fields;
    const before = errors.length;

    if (seenIds.has(id)) errors.push(`${id}: duplicate id`);
    seenIds.add(id);
    if (!isQuestionType(type)) {
      errors.push(`${id}: unknown type "${type}" (allowed: ${QUESTION_TYPES.join(', ')})`);
    }
    for (const field of FIELDS) {
      if (fields[field].includes(EM_DASH)) errors.push(`${id}: "${field}" contains an em dash`);
    }

    const text = texts.get(document);
    if (text === undefined) {
      errors.push(`${id}: document "${document}" not found in fixtures/corpus/`);
    } else {
      const count = countOccurrences(text, answer);
      if (count === 0) errors.push(`${id}: answer not found verbatim in ${document}`);
      if (count > 1) warnings.push(`${id}: answer appears ${count} times in ${document}`);
      const elsewhere = corpus
        .filter((doc) => doc.file !== document && doc.content.includes(answer))
        .map((doc) => doc.file);
      if (elsewhere.length > 0) {
        warnings.push(`${id}: answer also appears in ${elsewhere.join(', ')}`);
      }
    }

    const words = answer.trim().split(/\s+/).length;
    if (words < 2 || words > 12) {
      warnings.push(`${id}: answer has ${words} word(s), aim for 2 to 12`);
    }
    if (question.toLowerCase().includes(answer.toLowerCase())) {
      warnings.push(`${id}: the question contains its own answer`);
    }

    if (errors.length === before && isQuestionType(type)) {
      questions.push({ id, question, document, answer, type });
    }
  });
  return { questions, errors, warnings };
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    count += 1;
    from = haystack.indexOf(needle, from + 1);
  }
  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isQuestionType(value: string): value is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(value);
}
