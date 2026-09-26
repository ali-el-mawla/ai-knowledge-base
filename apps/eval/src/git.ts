import { execFileSync } from 'node:child_process';

export interface CommitInfo {
  hash: string;
  /** Uncommitted changes in the paths that can move the numbers. */
  dirty: boolean;
}

/** The paths whose changes can move the numbers: the runner, the RAG code, data and schema. */
export const EVAL_INPUT_PATHS = ['apps/eval', 'packages', 'fixtures', 'supabase'];

/** The checked-out commit, or null outside a git checkout (the report then says so). */
export function readCommit(repoRoot: string): CommitInfo | null {
  try {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' }).trim();
    const hash = git('rev-parse', '--short', 'HEAD');
    const status = git('status', '--porcelain', '--', ...EVAL_INPUT_PATHS);
    return { hash, dirty: status !== '' };
  } catch {
    return null;
  }
}
