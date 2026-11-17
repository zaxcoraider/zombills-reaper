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
| Dashboard page | React (host-provided) + esbuild bundle | ESM bundle at `ui.entry` |
| Bundles | esbuild | Three committed single-file bundles: `mcp/dist/server.js`, `backend/dist/server.js`, `ui/dist/index.mjs`. The root `package.json` has no runtime `dependencies` |
| Unit / property tests | Vitest + fast-check | Same as Zombills; no Jest |
| Linting / formatting | ESLint + Prettier | Match Zombills config |

## Kiro Crew facts this app depends on

Verified against the Crew 0.12.2 source and a live install on 2026-11-17. Sources: `.kiro/specs/reaper/spike-2026-11-17.md` (spike answers and skeleton checks) and `.kiro/specs/reaper/requirements.md` (Introduction, Req 15.3). This replaces the earlier list taken from the kiro.dev docs, which did not match 0.12.2. Re-check the Crew source before relying on anything not listed here.

- `app.json` at the repo root. Required fields: `name` (kebab-case), `version` (semver), `displayName`, `description`.
- **Install.** `kirocrew app install <dir>` copies the tree (spike Q1). `setup.onInstall` does not run on a local-path install and `onUpdate` is never dispatched, so nothing can install dependencies or build at install time. `node_modules` is dropped from the installed copy. Hence the committed esbuild bundles with zero runtime `dependencies`; this replaces "`onInstall` must install dependencies and build". `vendor/` must hold real files, never a symlink. After a source change: `npm ci && npm run build`, then `kirocrew app update zombills-reaper`.
- **Enable.** The CLI refuses to enable a third-party app. The user enables it in the dashboard (Apps → Library → The Reaper → Enable). Never set `agent.apps_allow_third_party` (spike Q1).
- **First install copies `<repo>/data`** into the installed app (`apps/manager_install.py:385`), so `<repo>/data` must not exist. It is gitignored (design review 1 #15).
- `setup.configSchema` values do not reach apps in 0.12.2 (Req 15.3). The manifest keeps the schema as documentation; the statements path lives in `data/settings.json`.
- **MCP launch.** Stdio servers start in a per-run session cwd (`~/workplace/kirocrew-workspace/cron_<id>_<run>`) with a stripped env, and `${HOME}` in `args` is not expanded on the session path, so the server never starts. Use `"command": "/bin/sh", "args": ["-c", "exec node \"$HOME/.kiro/crew/apps/<app>/mcp/dist/server.js\""]` (spike Q2, Q3). The server finds its data from its own bundle path, not from cwd.
- **Tool references.** App MCP servers are namespaced `<app>:<server>`. An agent's `tools` must say `@<app>:<server>`; `@<server>` dangles silently (spike Q5). A mounted tool that is only in `tools` is rejected in an unattended cron run, so the agent also lists it in `allowedTools`. Do not put `autoApprove` on a manifest `mcpServers` entry: the server then does not mount (spike Q5b).
- `agents[]` holds paths to agent files, not objects. Crew materialises an agent as `~/.kiro/agents/<app>--<agent>.json` and adds a `managedToolPolicy.exclude` list. A cron names the agent by its bare name (spike Q4).
- **Skills in cron runs.** An unattended cron run cannot load a skill (`load_resource` is rejected), so `scripts/build.ts` inlines `skills/reaper/SKILL.md` into the generated `agents/reaper.json` prompt (skeleton check 2026-11-17). `skills/<skill>/SKILL.md` keeps its front-matter (`name`, `description`, `triggers`, `always`) for dashboard chats.
- `crons[]`: `{name, cron_expr | every, message, agent, enabled}` plus optional `silent`, `timezone`, `strict_schedule` and `persistent_session`. Without `strict_schedule` a random start delay of up to 59 minutes applies. A cron only sends a prompt to an agent. The cron is named `<app>/<cron name>`. Renaming a cron and running `kirocrew app update` adds the new job and keeps the old one; remove it with `kirocrew cron remove <id>` (spike skeleton checks). Run one now with `kirocrew cron trigger <id>`.
- **Permissions.** `permissions.cron` is required when `crons` is declared. `permissions.mcpTools` is enforced. `permissions.api` is enforced and matches by prefix with no trailing slash: `"/apps/<app>/api"` (spike Q8c). Declare only what the app uses.
- **Backend.** Proxied at `/apps/{name}/api/*`. The backend gets `PORT` and `KIROCREW_PROXY_SECRET` in its env, and its cwd is the App root (`apps/backend.py`). Each request carries `X-KiroCrew-Proxy` (v1), `X-KiroCrew-Proxy-Nonce` and `X-KiroCrew-Proxy-V2`. The Reaper verifies v2 only (`X-KiroCrew-Proxy-V2` with `X-KiroCrew-Proxy-Nonce`, nonce accepted once), per `apps/proxy_auth.py` (`verify_proxy_request_v2`) and `apps/routes_proxy.py`. v1 can be replayed within 60 s.
- **Dashboard page.** `ui.entry` is relative to `ui/` (`"dist/index.mjs"` serves `ui/dist/index.mjs`). The host renders the exported `mount` as a React component, not as `mount(el)`. Host-provided bare imports: `react` and `@kirocrew/app-sdk` (spike Q8b). Page data comes from `useAppApi().get("/apps/<app>/api/...")`.
- Channels (Telegram for the demo) are configured in Crew Settings → Messaging Channels, not in this app. In a bot chat, `/agent reaper` routes later messages to the Reaper agent (not yet tested on Telegram).

## Dashboard build

- esbuild bundles each of the three entries into one committed file. `scripts/build.ts` runs them; `scripts/build-fresh.test.ts` rebuilds and compares bytes.
- **Host-provided imports:** `react` and `@kirocrew/app-sdk` stay external and are never bundled. They may be dev dependencies for types and tests only. The page imports nothing else from the host.
- JSX uses the classic transform (`h` from `react`), so the bundle imports only those two.
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
