# Craft

A monorepo of Stellar/Soroban templates and applications.

## Tech Stack

- **Next.js** — minimum supported version is **14.2.25** (patched 14.2.x line) across `apps/backend` and `apps/frontend` to address known security advisories, including the middleware authorization bypass (CVE-2025-29927).
- **React** — UI library used by the frontend and templates.
- **TypeScript** — typed JavaScript across all workspaces.
- **Stellar / Soroban** — smart contract and DEX templates.

## Workspaces

- `apps/backend` — API and backend services.
- `apps/frontend` — web application.
- `templates/*` — starter templates for Stellar/Soroban projects.

## Development

Install dependencies from the repository root, then run the relevant workspace scripts (for example `npm run --workspace @craft/frontend test -- app` and `npm run lint`).
