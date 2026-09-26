import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface CorpusFile {
  fileName: string;
  title: string;
  content: string;
  tags: string[];
}

/** File-name words that become tags ("travel-and-expense-policy.md" -> finance, policy). */
const TAG_BY_WORD: Readonly<Record<string, string>> = {
  api: 'engineering',
  customer: 'support',
  employee: 'hr',
  engineering: 'engineering',
  expense: 'finance',
  handbook: 'policy',
  incident: 'security',
  onboarding: 'onboarding',
  plans: 'pricing',
  policy: 'policy',
  pricing: 'pricing',
  privacy: 'privacy',
  product: 'product',
  retention: 'privacy',
  security: 'security',
  sla: 'support',
  support: 'support',
  travel: 'finance',
};

/** Lowercase tags, in file-name order, without duplicates. */
export function tagsFromFileName(fileName: string): string[] {
  const words = path
    .basename(fileName, path.extname(fileName))
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  const tags = words.map((word) => TAG_BY_WORD[word]).filter((tag) => tag !== undefined);
  return [...new Set(tags)];
}

/** The first level-1 heading, or the file name in words when there is none. */
export function titleOf(markdown: string, fileName: string): string {
  const heading = /^# +(.+?)\s*#*\s*$/m.exec(markdown)?.[1]?.trim();
  if (heading) return heading;
  const words = path.basename(fileName, path.extname(fileName)).replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Every markdown file in `directory`, sorted by name so runs are reproducible. */
export async function readCorpus(directory: string): Promise<CorpusFile[]> {
  const fileNames = (await readdir(directory)).filter((name) => name.endsWith('.md')).sort();
  return Promise.all(
    fileNames.map(async (fileName) => {
      const content = await readFile(path.join(directory, fileName), 'utf8');
      return {
        fileName,
        title: titleOf(content, fileName),
        content,
        tags: tagsFromFileName(fileName),
      };
    }),
  );
}
