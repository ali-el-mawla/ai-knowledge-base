#!/usr/bin/env node
// `npm run setup`. Safe to run again: it never resets the database (only
// `npm run db:reset` does). Node built-ins only, so it runs before `npm install`.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const isWindows = process.platform === 'win32';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

let stepNumber = 0;
const step = (title) => console.log(`\n${bold(`[${++stepNumber}] ${title}`)}`);
const ok = (msg) => console.log(`    ${green('ok')} ${msg}`);
const warn = (msg) => console.log(`    ${yellow('!')} ${msg}`);
function fail(msg, hint) {
  console.error(`\n${red('Setup stopped:')} ${msg}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/** Runs a command in the repo root. `capture` returns stdout instead of streaming it. */
function run(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    shell: isWindows, // npm/npx are .cmd shims on Windows
  });
  if (result.status !== 0 && !allowFailure) {
    if (capture) process.stderr.write(result.stderr ?? '');
    fail(`\`${command} ${args.join(' ')}\` failed (exit ${result.status}).`);
  }
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function readEnv() {
  return readFileSync(envPath, 'utf8');
}

function getEnvValue(text, key) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) return undefined;
  return match[1].trim().replace(/^"(.*)"$/, '$1');
}

/** Fills keys that are empty in .env; never overwrites a value the user set. */
function fillEmptyEnv(values) {
  let text = readEnv();
  const filled = [];
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const current = getEnvValue(text, key);
    if (current === undefined) {
      text += `\n${key}=${value}\n`;
      filled.push(key);
    } else if (current === '') {
      text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
      filled.push(key);
    }
  }
  writeFileSync(envPath, text);
  return filled;
}

async function fetchJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

// ---------------------------------------------------------------------------

console.log(bold('AI Knowledge Base setup'));

step('Checking Node.js');
{
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    fail(
      `Node ${process.versions.node} is too old.`,
      'Install Node 22.12+ (LTS) from https://nodejs.org',
    );
  }
  ok(`Node ${process.versions.node}`);
}

step('Installing dependencies (npm install)');
run('npm', ['install', '--no-fund', '--no-audit']);
ok('dependencies installed');

step('Preparing .env');
if (!existsSync(envPath)) {
  copyFileSync(path.join(root, '.env.example'), envPath);
  ok('created .env from .env.example');
} else {
  ok('.env already exists (kept as is)');
}

// Before Supabase: without Ollama, setup should stop in seconds, not after the image downloads.
step('Checking the embedding model');
{
  const env = readEnv();
  const provider = getEnvValue(env, 'EMBEDDING_PROVIDER');
  const model = getEnvValue(env, 'EMBEDDING_MODEL');
  if (provider === 'ollama') {
    const base = (getEnvValue(env, 'EMBEDDING_BASE_URL') || 'http://127.0.0.1:11434/v1').replace(
      /\/v1\/?$/,
      '',
    );
    try {
      const { version } = await fetchJson(`${base}/api/version`);
      ok(`Ollama ${version} is running`);
    } catch {
      fail(
        `Ollama is not reachable at ${base}.`,
        'Install it from https://ollama.com/download and start it, or set EMBEDDING_PROVIDER=openai in .env (see README).',
      );
    }
    const { models = [] } = await fetchJson(`${base}/api/tags`);
    const installed = models.some((m) => m.name === model || m.name === `${model}:latest`);
    if (installed) {
      ok(`${model} is installed`);
    } else {
      console.log(`    pulling ${model} (about 300 MB for nomic-embed-text)...`);
      const response = await fetch(`${base}/api/pull`, {
        method: 'POST',
        body: JSON.stringify({ model, stream: false }),
      });
      if (!response.ok)
        fail(`Could not pull ${model}: ${response.status} ${await response.text()}`);
      ok(`${model} downloaded`);
    }
  } else {
    ok(`EMBEDDING_PROVIDER=${provider} (${model}); make sure EMBEDDING_API_KEY is set`);
  }
}

step('Checking Docker (Supabase runs in Docker)');
if (!run('docker', ['info'], { capture: true, allowFailure: true }).ok) {
  fail(
    'Docker is not running.',
    'Start Docker Desktop (or the Docker daemon) and run `npm run setup` again.',
  );
}
ok('Docker is running');

step('Starting local Supabase (first run downloads images, a few minutes)');
run('npx', ['supabase', 'start']);
{
  const status = run('npx', ['supabase', 'status', '-o', 'json'], { capture: true });
  const jsonStart = status.stdout.indexOf('{');
  const info = JSON.parse(status.stdout.slice(jsonStart));
  const filled = fillEmptyEnv({
    SUPABASE_URL: info.API_URL,
    SUPABASE_PUBLISHABLE_KEY: info.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: info.SECRET_KEY,
    NEXT_PUBLIC_SUPABASE_URL: info.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: info.PUBLISHABLE_KEY,
  });
  ok(filled.length ? `filled in .env: ${filled.join(', ')}` : 'Supabase keys already in .env');
}

step('Applying database migrations');
run('npx', ['supabase', 'migration', 'up']);
ok('database schema is up to date');

step('Building shared packages and the API');
run('npx', ['turbo', 'run', 'build', '--filter=@repo/api...']);
ok('built');

step('Seeding the demo account and sample documents');
if (existsSync(path.join(root, 'apps/api/dist/cli/seed.js'))) {
  run('npm', ['run', 'seed']);
} else {
  warn('seed CLI not built yet; skipped');
}

step('Chat model');
{
  const env = readEnv();
  const provider = getEnvValue(env, 'CHAT_PROVIDER');
  const key = getEnvValue(env, 'CHAT_API_KEY');
  if (!provider) warn('CHAT_PROVIDER is empty: documents and search work, chat is disabled.');
  else if (!key && provider !== 'ollama')
    warn(
      `Add CHAT_API_KEY for "${provider}" in .env to enable chat (documents and search work without it).`,
    );
  else ok(`chat via ${provider} (${getEnvValue(env, 'CHAT_MODEL')})`);
}

console.log(`
${green(bold('Setup complete.'))}

  Start the apps:   ${bold('npm run dev')}
  Web app:          http://127.0.0.1:3000
  API:              http://127.0.0.1:4000/api/health
  Supabase Studio:  http://127.0.0.1:54323
  Test inbox:       http://127.0.0.1:54324
`);
