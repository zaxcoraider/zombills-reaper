---
inclusion: always
---

# Tech Stack

## Approved stack

| Layer | Library / Tool | Notes |
| --- | --- | --- |
| Language | TypeScript (strict) | ESM (`"type": "module"`) everywhere |
| Runtime | Node 22 | MCP server and backend both run on Node 22 |
| Domain logic | `@zombills/core` | Vendored built copy under `vendor/`; see below |
| MCP server | `@modelcontextprotocol/sdk`, stdio transport | Declared in `app.json` `mcpServers` (command/args/env, same format as `mcp.json`) |
| Backend | Node HTTP server | `backend {entryPoint, type: "node", port: "auto", healthCheck}` |
| Dashboard page | React + Vite library build | ESM bundle at `ui.entry` |
| Unit / property tests | Vitest + fast-check | Same as Zombills; no Jest |
| Linting / formatting | ESLint + Prettier | Match Zombills config |

## Kiro Crew facts this app depends on

Verified 2026-11-17 from kiro.dev/docs/crew (apps, manifest, sdk, build-first-app). Recorded in the "Kiro Crew findings" section of Zombills `architecture.md`; that section is the source of truth. Re-check the docs before relying on anything not listed here.

- `app.json` at the repo root. Required fields: `name` (kebab-case), `version` (semver), `displayName`, `description`.
- Install: Crew shallow-clones into `~/.kiro/crew/app-sources/{name}/`, runs `setup.onInstall` (300 s limit, runs with `set -euo pipefail`), then copies to `~/.kiro/crew/apps/{name}/`. `node_modules` and `.git` are not copied from the source and symlinks are not followed. So `onInstall` must install dependencies and build, and `vendor/` must hold real files, never a symlink.
- Local install: `POST http://localhost:5476/api/apps/install {"source": "<path>"}` then `/enable`, or App Store → Install from local path. Dev loop: `kirocrew app dev <name>`.
- `crons[]`: `{name, cron_expr | every, message, agent, enabled}`. A cron only sends a prompt to an agent.
- `agents[]`: `{name, model, description, prompt, tools: ["@kirocrew-core", ...]}`.
- `skills/<skill>/SKILL.md` with front-matter `name`, `description`, `triggers`, `always`.
- `ui.entry` (ESM bundle) and `ui.pages[{route, label, icon}]`. Host hooks include `useAppApi` and `useNotify`.
- Backend is proxied at `/apps/{name}/api/*`; requests are HMAC-signed with the `X-Crew-Proxy` header. Verify the signature on every request.
- `permissions.api` is enforced; other permissions are advisory. Declare only what the app uses.
- `setup.configSchema` (JSON Schema) holds user config, e.g. the statements folder path.
- Channels (Telegram for the demo) are configured in the Crew Gateway, not in this app.

## Dashboard build

- Vite library mode, ESM output, one entry.
- **Host-provided externals:** `react`, `react-dom`, `lucide-react`, `@kirocrew/app-sdk`. Mark them `external` in `rollupOptions`; never bundle them. They may be dev dependencies for types and tests only.
- The page gets its data from the Reaper backend through `useAppApi`. It never reads the statements folder itself.

## `@zombills/core` vendoring

- `scripts/sync-core` builds `packages/core` in the Zombills repo and copies its `dist/` and `package.json` into `vendor/zombills-core/`. The copy is committed.
- Not allowed: publishing `@zombills/core` to npm, a git or git-subdirectory dependency, a `file:` link to the Zombills repo, or a symlink.
- Reference it as `"@zombills/core": "file:./vendor/zombills-core"` (a path inside this repo, so it survives Crew's copy).
- `@zombills/core` depends on `papaparse` at runtime. Keep the Reaper's `papaparse` version identical to the one in Zombills `packages/core/package.json` (5.7.1 at the time of writing).
- Never edit files under `vendor/` by hand. Fix bugs in Zombills, then re-run the sync script. Record the Zombills commit hash the copy was built from in `vendor/zombills-core/SOURCE`.

## Prefer the approved stack

Before adding a library, check whether something above already does the job. Specifically:

- HTTP server → Node's built-in `node:http`; no Express unless a concrete problem demands it.
- HTTP client → none. The Reaper makes no outbound requests (see `privacy.md`).
- Storage → JSON files in the app data directory; no database.
- Testing → Vitest and fast-check. Property tests cover scan diffing (same statements in any order give the same result; re-scanning unchanged input reports nothing new).

## TypeScript

Strict mode is on. No `any` without a comment explaining why it is unavoidable. Money values are integer cents, as in Zombills `money.md`; format only at the edge (chat message, dashboard).
