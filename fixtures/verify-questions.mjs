#!/usr/bin/env node
// Checks the retrieval evaluation questions against the corpus in fixtures/corpus/.
//
// Usage:
//   node fixtures/verify-questions.mjs                 (questions.json, or the template if it is missing)
//   node fixtures/verify-questions.mjs path/to/file.json
//
// Errors (exit code 1): invalid JSON or shape, duplicate ids, unknown type, missing document,
// or an answer that does not appear character for character in its document.
// Warnings (exit code 0): answer length outside 2 to 12 words, an answer that appears more than
// once in its document or also appears in other documents, or a question that contains its answer.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.join(here, 'corpus');
const TYPES = [
  'exact-code',
  'table',
  'nested-heading',
  'ambiguous-term',
  'code-block',
  'paraphrase',
];
const FIELDS = ['id', 'question', 'document', 'answer', 'type'];

function resolveQuestionsFile() {
  const arg = process.argv[2];
  if (arg) {
    for (const candidate of [path.resolve(process.cwd(), arg), path.resolve(here, arg)]) {
      if (existsSync(candidate)) return candidate;
    }
    console.error(`File not found: ${arg}`);
    process.exit(1);
  }
  const main = path.join(here, 'questions.json');
  if (existsSync(main)) return main;
  const template = path.join(here, 'questions.template.json');
  console.log('questions.json not found, checking questions.template.json instead.');
  return template;
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let from = 0;
  while (needle.length > 0) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    count += 1;
    from = index + 1;
  }
  return count;
}

const squash = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();

function loadCorpus() {
  const docs = new Map();
  for (const name of readdirSync(corpusDir)) {
    if (!name.endsWith('.md')) continue;
    const text = readFileSync(path.join(corpusDir, name), 'utf8').replace(/\r\n/g, '\n');
    docs.set(name, text);
  }
  return docs;
}

const file = resolveQuestionsFile();
const docs = loadCorpus();
const errors = [];
const warnings = [];

let questions;
try {
  questions = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`Cannot read ${path.relative(process.cwd(), file)}: ${error.message}`);
  process.exit(1);
}
if (!Array.isArray(questions) || questions.length === 0) {
  console.error('The file must contain a non-empty JSON array of questions.');
  process.exit(1);
}

const seenIds = new Map();
const byType = new Map();
const byDocument = new Map();
let passed = 0;

questions.forEach((entry, index) => {
  const label =
    entry && typeof entry.id === 'string' && entry.id ? entry.id : `entry #${index + 1}`;
  const before = errors.length;

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    errors.push(`${label}: must be an object`);
    return;
  }
  for (const field of FIELDS) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      errors.push(`${label}: "${field}" must be a non-empty string`);
    }
  }
  if (errors.length > before) return;

  const { id, question, document, answer, type } = entry;

  if (seenIds.has(id)) {
    errors.push(`${label}: duplicate id (also used by entry #${seenIds.get(id) + 1})`);
  } else {
    seenIds.set(id, index);
  }

  if (!TYPES.includes(type)) {
    errors.push(`${label}: unknown type "${type}" (allowed: ${TYPES.join(', ')})`);
  }

  const text = docs.get(document);
  if (text === undefined) {
    errors.push(`${label}: document "${document}" not found in fixtures/corpus/`);
  } else {
    const hits = countOccurrences(text, answer);
    if (hits === 0) {
      let hint = '';
      if (squash(text).includes(squash(answer))) {
        hint = ' (it matches if case and spacing are ignored: copy it again from the file)';
      } else {
        const elsewhere = [...docs].filter(([, other]) => other.includes(answer)).map(([n]) => n);
        if (elsewhere.length > 0) hint = ` (found in ${elsewhere.join(', ')} instead)`;
      }
      errors.push(`${label}: answer not found verbatim in ${document}${hint}`);
    } else {
      if (hits > 1) {
        warnings.push(`${label}: answer appears ${hits} times in ${document}, use a longer span`);
      }
      const others = [...docs]
        .filter(([name, other]) => name !== document && other.includes(answer))
        .map(([name]) => name);
      if (others.length > 0) {
        warnings.push(`${label}: answer also appears in ${others.join(', ')}`);
      }
    }
  }

  const words = answer.trim().split(/\s+/).length;
  if (words < 2 || words > 12) {
    warnings.push(`${label}: answer has ${words} word(s), aim for 2 to 12`);
  }
  if (question.toLowerCase().includes(answer.toLowerCase())) {
    warnings.push(`${label}: the question contains its own answer`);
  }

  byType.set(type, (byType.get(type) ?? 0) + 1);
  byDocument.set(document, (byDocument.get(document) ?? 0) + 1);
  if (errors.length === before) passed += 1;
});

console.log(`\nChecked ${questions.length} questions from ${path.relative(process.cwd(), file)}`);
console.log(`Passed: ${passed}   Errors: ${errors.length}   Warnings: ${warnings.length}\n`);

console.log('By type:');
for (const type of TYPES) console.log(`  ${type.padEnd(16)} ${byType.get(type) ?? 0}`);
console.log('\nBy document:');
for (const name of [...docs.keys()].sort()) {
  console.log(`  ${name.padEnd(42)} ${byDocument.get(name) ?? 0}`);
}

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const line of warnings) console.log(`  - ${line}`);
}
if (errors.length > 0) {
  console.log('\nErrors:');
  for (const line of errors) console.log(`  - ${line}`);
  process.exit(1);
}
console.log('\nAll answers appear verbatim in their documents.');
