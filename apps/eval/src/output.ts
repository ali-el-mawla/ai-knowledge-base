/** Progress and results go to stdout, warnings and errors to stderr. */
export function log(message = ''): void {
  process.stdout.write(`${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`${message}\n`);
}

/** Milliseconds since `start` (from performance.now()) as "1.2 s". */
export function elapsed(start: number): string {
  return `${((performance.now() - start) / 1000).toFixed(1)} s`;
}
