# 0001. npm workspaces, Turborepo and compiled internal packages

- Status: accepted
- Date: 2026-09-26

## Context

The brief asks for a Turborepo monorepo with a Next.js web app, a NestJS API and shared packages. Reviewers clone and run it, so every extra tool is friction. Both apps must share contracts (zod schemas, types, error codes, the SSE codec) and pure logic (chunkers, prompt builder). Nest runs the compiled API on Node, so everything it imports at runtime must be JavaScript.

## Decision

- **npm workspaces** (`apps/*`, `packages/*`), `packageManager: npm@10.9.2`, `engines.node >= 22.12`. npm ships with Node.
- **Turborepo** for the task graph: `build` depends on `^build`, and `dev`, `lint`, `typecheck` and `test` build their dependencies first. Outputs are cached.
- **Internal packages compiled** with `tsc` to `dist`, with `exports` pointing at `dist`, and `tsc --watch` in development. One output serves Nest and Next.js.
- **ESM everywhere** (`module: NodeNext`), shared `typescript-config` and `eslint-config` packages, Vitest for every suite (SWC in the API for decorator metadata).
- **One root `.env`**, loaded by both apps and listed as a Turborepo global dependency.
- **Windows-safe scripts:** `.mjs` files with Node built-ins, `eol=lf` in `.gitattributes`. CI on Ubuntu catches import-case mistakes.

## Consequences

- A fresh clone needs Node, Docker and Ollama; `npm run setup` does the rest. A second build is a full cache hit.
- Packages must be built before an app uses them. The task graph does it, but types are only as fresh as the last build (watch mode covers development).
- Imports inside the packages carry `.js` suffixes (NodeNext), which is unusual for people used to bundlers.
