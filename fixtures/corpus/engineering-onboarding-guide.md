# Engineering Onboarding Guide

Owner: Developer Experience team. Last updated 19 August 2026. For every new engineer joining Quaylark Engineering.

## Your first weeks

Welcome to Quaylark Engineering. This guide gets you from a new laptop to your first production change. Your manager assigns you an onboarding buddy on day 1. Ask your buddy anything, especially the questions that feel too small to ask.

- Day 1: laptop, hardware security key, single sign-on and chat accounts. Meet your buddy.
- Week 1: finish the local setup below, attend the architecture walkthrough, and open your first pull request. Pick an issue with the label `starter-task`.
- Week 2: ship a change to production behind a feature flag.
- Weeks 3 to 6: take on a normal ticket in your team's sprint.
- Week 6: first on-call shadow shift.
- After 3 months: join the production on-call rotation, once you have completed 2 shadow shifts.

## Accounts and access

- Request access to systems through the Access Request form in the IT portal. Your manager approves it.
- Production read access requires the security training module SEC-101.
- Nobody has standing write access to production. Emergency changes go through the break-glass process, which is logged and reviewed by the Security team.
- Your hardware security key is required for single sign-on, the code host and the VPN. Report a lost key to the Security team within 1 hour.

## Local development setup

### Prerequisites

- macOS 14 or later, or Ubuntu 22.04
- Docker Desktop or Docker Engine 24 or later
- Node.js 20.11 (managed with nvm) and pnpm 9 through corepack
- Go 1.22 for the scheduling engine
- make and git

### Clone and bootstrap

```bash
# Clone the monorepo (about 1.8 GB with history)
git clone git@git.quaylark.example:platform/dockyard.git
cd dockyard

# Use the pinned Node version from .nvmrc and install dependencies
nvm install
corepack enable
pnpm install --frozen-lockfile

# Start Postgres 16, Redis and the local S3 emulator
docker compose up -d postgres redis minio

# Create the schema and load demo data.
# The seed creates a demo warehouse called "Pier 9 Demo" with 12 dock doors and 3 carriers.
make db-migrate
make db-seed

# Run the web app and the API together
pnpm dev
```

When `pnpm dev` is running, the web app is at `http://localhost:4100` and the API is at `http://localhost:4200/v3`. Sign in as `admin@pier9.test`. The password is printed at the end of `make db-seed`.

Production data is never copied to laptops or to development environments. Use the seed data, or create what you need with the factories in `packages/testing`.

### Running tests

```bash
# Unit tests for one package
pnpm --filter @quaylark/scheduler test

# The full suite, as CI runs it (takes about 12 minutes)
make test-all

# Scheduling engine tests (Go)
cd services/slotter && go test ./...
```

### Troubleshooting

- Port 5432 already in use: stop your local Postgres, or set `PG_PORT=55432` in `.env.local`.
- `pnpm install` fails with an authentication error: run `make npm-login` to sign in to the internal package registry.
- The seed fails halfway: run `make db-reset` and then `make db-seed` again.
- If you are blocked on setup for more than 2 hours, ask in #devex-support.

## Repository conventions

### Layout

The `dockyard` monorepo holds almost everything:

- `apps/web`: the customer web app (React)
- `apps/carrier-portal`: the Carrier Portal (React)
- `services/api`: the Public API and internal API (Node.js)
- `services/slotter`: the scheduling engine that finds free dock slots (Go)
- `services/billing` and `services/auth`: billing and authentication services
- `packages/`: shared libraries, including `packages/testing`
- `infra/`: Terraform for all environments

### Branches and commits

- Branch from `main`. Name branches `<type>/QL-<ticket number>-<short-description>`, for example `feat/QL-2317-door-buffer-times`.
- Commit messages follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` and `test:`.
- Pull requests are squash merged. The pull request title becomes the commit message, so it must include the ticket key.

### Feature flags

- Every change that users can see ships behind a feature flag.
- Flag names follow the pattern `ql_<team>_<feature>`, for example `ql_yard_gate_photos`.
- Remove a flag within 30 days of rolling it out to all customers.

### Database migrations

- One migration per pull request.
- Migrations must be backward compatible with the code currently in production. Use expand and contract: add the new column, move the code, then remove the old column in a later release.
- Never rename or drop a column in a single step.

## Code review rules

- Every pull request needs at least 1 approval from a code owner.
- Changes to `services/billing`, `services/auth` or `infra/` need 2 approvals, and one of them must come from the owning team.
- Keep pull requests under 400 changed lines, not counting generated files and lockfiles. Larger pull requests need a note in the description explaining why they cannot be split.
- Reviewers respond within 1 business day. If nobody has responded by then, ask in #eng-review.
- The author resolves every comment before merging. Comments that start with `nit:` are suggestions and do not block the merge.
- CI must be green before merging: lint, type check, unit tests and the dependency security scan. Nobody merges with failing checks, even with admin rights.
- No merges to `main` after 15:00 local time on Fridays.
- There is a merge freeze from 20 December to 3 January. Only fixes approved by the Engineering Manager on duty are merged during the freeze.
- After approval, authors merge their own pull requests.

## Deploying

- Every merge to `main` deploys to staging automatically.
- Production deploys run Monday to Thursday, between 09:00 and 16:00 Toronto time, through the deploy pipeline.
- To roll back a service, run `make rollback SERVICE=<name>` from a clean checkout of `main`, or use the Rollback button in the pipeline.
- A hotfix outside the deploy window needs approval from the Engineering Manager on duty.

## Getting ready for on-call

- Read the Information Security and Incident Response Runbook.
- Complete the incident training module SEC-102.
- Complete 2 shadow shifts with an experienced primary on-call engineer.
- Make sure the paging app is installed on your phone and that a test page reaches you.

## Getting help

- #eng-help for general engineering questions.
- #devex-support for problems with tooling, CI or the local setup.
- Developer Experience office hours every Wednesday at 14:00 Toronto time.
- Your onboarding buddy, for everything else.
