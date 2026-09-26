import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface CorpusDocument {
  /** File name in fixtures/corpus/, the key questions use in their `document` field. */
  file: string;
  title: string;
  content: string;
}

/** Every `.md` file in the folder, sorted by name, with LF line endings. */
export function loadCorpus(dir: string): CorpusDocument[] {
  const documents = readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((file) => {
      const content = readFileSync(path.join(dir, file), 'utf8').replace(/\r\n?/g, '\n');
      const title = extractTitle(content);
      if (!title) throw new Error(`${file} has no "# " title heading.`);
      return { file, title, content };
    });
  if (documents.length === 0) throw new Error(`No .md documents found in ${dir}.`);

  // Stored documents are matched to files by title, so titles must be unique.
  const seen = new Set<string>();
  for (const { file, title } of documents) {
    if (seen.has(title)) {
      throw new Error(`Two corpus documents share the title "${title}" (${file}).`);
    }
    seen.add(title);
  }
  return documents;
}

/**
 * The text of the first level-1 heading outside a fenced code block. The fence check
 * matters: shell comments inside code blocks ("# Clone the monorepo") also start with "# ".
 */
export function extractTitle(markdown: string): string | null {
  let fence: string | null = null;
  for (const line of markdown.split('\n')) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^# +(.+?)\s*#*\s*$/.exec(line);
    if (heading?.[1]) return heading[1].trim();
  }
  return null;
}
