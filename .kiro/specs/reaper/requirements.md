# Requirements Document

## Introduction

The Reaper is a Kiro Crew 0.12.2 app and the companion to Zombills (`/Users/zax/Projects/Kiroween-Hackathon`). Once a month it reads the bank statement CSVs in a folder on the user's own machine, runs `@zombills/core` on them, compares the result with what it saw before, and tells the user in their Crew channel (Telegram for the demo) about new undead and possessed charges. When the user replies "bury <service>", it records a Tombstone and drafts the cancellation: the cancel link from the Zombills cancel-helper data, or a cancellation email. A Crew dashboard page shows the graveyard over time.

This spec covers, in one pass:

1. the `app.json` manifest;
2. `scripts/sync-core`, which vendors a built `@zombills/core`, and the committed self-contained bundles that Crew runs;
3. the stdio MCP server with the tools `scan_statements`, `list_graveyard`, `bury`, `unbury` and `set_statements_folder`, and the History file it keeps;
4. the Reaper agent and its skill;
5. the monthly cron and a way to run it now;
6. the dashboard page and the Node backend behind the proxy HMAC check;
7. the README and the demo statements.

### Privacy

`privacy.md` applies in full. In short: statement files are read in place and never copied; parsed rows live only in the MCP server's memory during a scan; MCP tool results and chat messages carry summaries only; the Reaper's runtime code makes no outbound network request; logs hold counts and error kinds only. Requirement 13 turns these into checks.

Two points need care:

- **Merchant text.** For a merchant `@zombills/core` does not recognise, the merchant name is cleaned bank text and can hold a place or a person's name (graveyard-memory Introduction, "Privacy"). The Reaper only shows recurring charges, never one-off purchases, and caps every merchant name at 80 code points in tool results and messages (Requirement 4.6).
- **The statements path.** The path is user config. It is never logged, and a tool result or chat message names only the folder's last path segment (Requirement 3.5). When the user sets it through the agent, the full path is a tool argument, so it reaches the model provider and Crew's transcripts; editing `settings.json` by hand is the private option (Requirement 3.6).
- **Crew's built-in tools.** Crew mounts its base built-in tools (`read`, `glob`, `grep`) into every agent and does not strip them (`apps/permissions.py`). The rule that the agent reads statements only through the Reaper MCP tools is therefore enforced by the agent prompt and the skill, not by Crew (Requirement 8). `privacy.md` says so (Requirement 15.3).
- **Crew-side storage.** Crew stores cron results, which include the alert text, in `~/.kiro/crew/cron-history` (`cron_history.py`), outside the Data dir. Crew's beacon sends 5 fixed fields and no app data (`beacon.py`).

### Findings from the Crew 0.12.2 source

The Crew docs summarised in Zombills `architecture.md` ("Kiro Crew findings") leave gaps. These were read from the installed package at `~/.kiro/crew-venv/lib/python3.12/site-packages/kiro_crew/` on 2026-11-17. Paths below are relative to that directory.

| Question | Finding | Source |
| --- | --- | --- |
| Where is the app data dir? | `~/.kiro/crew/apps/{name}/data/`, created with mode 0700. It sits inside the installed app directory. | `apps/manager_records.py` (`app_dir`, `app_data_dir`), `config/paths.py` (`config_dir`, overridable by `KIROCREW_HOME`) |
| How are `mcpServers` stdio servers launched? | Registered into the agent MCP config as `{app}:{server}` and spawned by kiro-cli. kiro-cli **spawns them under the session's cwd, not the app root, and strips the environment**; only the manifest's own `env` is applied. Relative script paths are anchored to the app root **only for `.py` launchers**. In `args`, only `${HOME}`, `${USER}`, `${LOGNAME}`, `${USERPROFILE}`, `${USERNAME}` are expanded. | `apps/bridges_mcp.py` (`_register_mcp_servers`, `_resolve_app_launcher_arg`, `resolve_stdio_command`), `env.py` (`_SPEC_ARG_VARS`, `expand_spec_args`), `agent_materialization/mcp_sources.py` |
| Can the MCP server get the app data dir and app config? | Not from Crew. No variable names the app root, data dir or config. The server must find its own install directory from its script location (`import.meta.url`) and use `<app root>/data`. | as above |
| How do `setup.configSchema` values reach the app? | **They do not, in 0.12.2.** `SetupConfig.configSchema` is parsed and serialised, and nothing else in the package reads it (no form, no stored values, no env). | `apps/manifest_sections.py` (`SetupConfig`); a search of the whole package for `configSchema` finds only that file |
| How does the backend get its port and secret? | Spawned with `cwd` = app root and a minimal env holding `PORT`, `KIROCREW_APP_NAME`, `KIROCREW_HOME` and, when `.app_secret` exists, `KIROCREW_PROXY_SECRET`. | `apps/backend.py` (spawn env near `minimal_env(PORT=…)`, secret injection near `.app_secret`, `cwd=`) |
| What does the proxy sign? | Header **`X-KiroCrew-Proxy: <ts>:<hex>`**, with `<hex>` = HMAC-SHA256(secret, `"<ts>:<METHOD>:<path?query>:<sha256 hex of body>"`), where `<path?query>` is the raw `/api/...` target as sent; the backend checks `<ts>` is within ±60 s. A v2 signature with a nonce rides in separate headers and may be ignored. `.app_secret` missing means the gateway refuses to proxy (502). | `apps/routes_proxy.py` (signing block, "Header format") |
| How does a cron result reach the user's channel? | Crons may name `agent`, `message`, `cron_expr`/`every`, `timezone`, `silent` and more. After an agent run, the result goes to the dashboard tab and bell, then to the channel of the session that created the job (an app cron has none), else the user-pinned `job.channel`, else a Slack DM. The delivery channel is a per-job user setting that the manifest does not own. With `silent: true` auto-delivery is off and the agent sends with the `@kirocrew-core` tool `send_message`, whose `session` value may name a channel such as `telegram` for the owner's DM. | `apps/bridges_crons.py` (`_cron_defs_from_manifest`, `_manifest_job_fields`, `_resync_app_cron` docstring), `cron_service/model.py` (`CronJob.channel`, `silent`), `slack/gateway_runtime/cron_delivery.py`, `validation_parts/messaging_session_schemas.py`, `constants.py` (`CHANNEL_OWNER_DM_NAMESPACES`) |
| How is a job run now? | `kirocrew cron trigger <job_id>` posts to the gateway to fire the job at once; app jobs are named `{app}/{cron name}`. | `cli_commands_cron.py`, `cron_trigger.py`, `apps/bridges_sources.py` (`_namespace`) |
| Empty cron `timezone`? | Resolves to the Crew config zone, then UTC, at fire time. | `apps/bridges_crons.py` (`_manifest_job_fields` comment) |
| What does an installed copy contain? | A local-path install does **not** run `setup.onInstall`; `onUpdate` is never dispatched. `node_modules` and `.git` are dropped from every installed copy. The only dependency step is `npm install --production` when the backend starts. | `apps/manifest_sections.py:729-737`, `apps/manager_tree.py:108-136` (`_COPY_IGNORE`), `apps/manager_install.py:363`, `apps/backend.py:958-1000` |
| What permissions are required? | Declaring `crons` without `permissions.cron: true` makes Crew refuse the install. Without `permissions.mcpTools`, Crew mounts all of `kirocrew-core`, `kirocrew-cron` and `kirocrew-dashboard` into every agent; with it, only the named tools (plus `skill_search`). Base built-ins `read`, `glob`, `grep` are never stripped. | `apps/manifest.py:191-210, 728`, `apps/permissions.py:83, 103-143` |
| Cron start time? | Without `strict_schedule: true`, Crew adds a random start delay of up to 59 minutes. | `apps/manifest_sections.py:59-63` |

### Decisions taken because of these findings

- **Committed bundles.** Because a local-path install runs no `onInstall` and no installed copy has `node_modules`, `mcp/dist/server.js`, `backend/dist/server.js` and `ui/dist/index.mjs` are single-file bundles built with esbuild, with `@zombills/core` and every other runtime library inlined, and committed. The root `package.json` has **zero runtime `dependencies`**, so Crew's `npm install --production` fetches nothing. A CI-style test checks the committed bundles match the source (Requirement 2.9).
- **Permissions.** `permissions` is exactly `{ "cron": true, "mcpTools": ["send_message"] }` (Requirement 1.6).

> **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): `permissions` also holds `"api": ["/apps/zombills-reaper/api"]` (no trailing slash), because `useAppApi().get()` is checked against `permissions.api` by prefix and the page needs it. See Requirement 1.6.

- **Statements folder.** `setup.configSchema` declares `statementsFolder` so the manifest documents it and a later Crew can fill it, but the Reaper reads the folder from its own Settings file (`<data dir>/settings.json`). The user sets it by telling the Reaper agent in the Crew dashboard chat, which calls `set_statements_folder` (Requirement 3). This adds one tool to the four in the brief. Editing `settings.json` by hand also works.
- **MCP launch.** `app.json` launches the server as `node` with the absolute path `${HOME}/.kiro/crew/apps/zombills-reaper/mcp/dist/server.js`. A Crew with `KIROCREW_HOME` set elsewhere is not supported in this spec (README says so).

> **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): `${HOME}` in `args` is **not** expanded when Crew projects the server onto the session, and the server silently never starts. The server is launched as `"command": "/bin/sh", "args": ["-c", "exec node \"$HOME/.kiro/crew/apps/zombills-reaper/mcp/dist/server.js\""]`, where the shell expands `$HOME` (2/2 runs). Bare `node` resolves through the PATH the gateway inherits. See Requirement 1.2.

- **Header name.** The steering files say `X-Crew-Proxy`; the 0.12.2 source sends `X-KiroCrew-Proxy`. This spec uses the source's name. `tech.md` and `privacy.md` SHALL be corrected in the same change (Requirement 15.3).

> **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): the proxy sends three headers: `X-KiroCrew-Proxy` (v1), `X-KiroCrew-Proxy-Nonce` and `X-KiroCrew-Proxy-V2`. The backend verifies the **v2** signature with a replay cache (`apps/proxy_auth.py`, `verify_proxy_request_v2`) and ignores v1. See Requirement 11.4.

- **Alert delivery.** The cron is `silent: true`, and the agent sends alerts itself with `send_message` to `telegram`. A month with nothing new sends no chat message, so the channel is never filled with "all quiet" posts. The one exception is a data-free "no statements folder yet" message (Requirement 9.6). The run still shows in the cron's dashboard tab.
- **Inbound "bury".** Telegram messages reach the agent the user's Crew routes that channel to. The README tells the user to route their Telegram DM to the Reaper agent. How that setting is named in Crew is checked during design; if routing is not possible, the fallback is that the user sends "bury" in the Reaper's dashboard chat tab.

> **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): the routing mechanism is Telegram's `/agent` picker (`/agent reaper`). It is **not tested yet** (spike Q7). Design isolates it and lists what the Telegram test must confirm; the dashboard chat fallback stays.

### Scope budget

The deadline is 4 Dec, about 2 days of Kiro tasks. The spec is sized for 16 to 20 tasks. Each requirement is marked **Must** or **Should** in its heading, and some criteria inside a Must requirement are marked *(Should)*. Should items may be dropped without changing the others.

- **Must:** the manifest (R1), vendoring and bundles (R2), the folder setting (R3), the scan (R4), the Scan summary (R5), `bury` and `list_graveyard` (R6), the History (R7), the agent (R8), the skill and Telegram delivery (R9), the cron (R10), privacy checks (R13), the README and demo (R14), repo layout (R15) and correctness properties (R16).
- **Should:** the dashboard backend (R11), the dashboard page (R12) and `unbury` (R6.7, R6.10).

The tasks SHALL start with an end-to-end walking skeleton: `app.json`, a one-tool MCP bundle, the agent, the cron, a local install, `kirocrew cron trigger`, a scan and a Telegram `send_message`, then "bury". Everything else is added on top of that working path.

### Out of scope

- PDF statements. Only `.csv` files are read.
- More than one user, or more than one statements folder.
- Sub-folders of the statements folder.
- Cancelling for the user, logging in to a service, or sending the email. The Reaper drafts only.
- Bank linking, any server outside the machine running Crew, and any copy of the detection logic.
- Asking the user whether they still use a charge. Only a "bury" makes something a zombie.
- A `KIROCREW_HOME` other than `~/.kiro/crew`.
- Telling apart the same charge on two accounts. Identical charges on the same day across files are merged (Requirement 4.4); the README says so.

### Open questions (spike before design)

> **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): answered in `spike-2026-11-17.md` except Q6 (Telegram delivery) and Q7 (inbound routing), which are untested, Q10 (each run gets a fresh MCP server process; the count under load was not measured) and part of Q5 (whether `read`, `glob`, `grep` are present). `design.md` ("Spike results" and "Telegram test") records how each answer is used.

Check these on the local Crew 0.12.2 before writing `design.md`:

1. **Local install:** Confirm that `onInstall` is skipped, what the installed tree contains, and that the committed bundles start with no `node_modules` and that `npm install --production` at backend start fetches nothing.
2. **Node command:** What `command: "node"` resolves to in the materialized `~/.kiro/agents/zombills-reaper--reaper.json` and in the Crew MCP config.
3. **Folder access:** Whether a server started by kiro-cli can read a folder under `~/Documents` (macOS privacy permission) and write `apps/zombills-reaper/data` inside the agent sandbox.
4. **Cron agent name:** Bare `reaper` or `zombills-reaper/reaper`.
5. **Tool surface:** List the agent's real tools with and without `permissions.mcpTools`, and whether `read`, `glob` and `grep` are present. Record the list in design and the README.
6. **Telegram delivery:** Whether `send_message` with `session: "telegram"` from a silent cron run reaches the owner DM.
7. **Inbound routing:** Telegram has an `/agent` picker (`telegram/commands.py:245`, `transport_dispatch.py:1268`). Whether it sticks to the Reaper agent for that chat, and what the user loses in their other Telegram use.
8. **Dashboard page:** Whether `useAppApi().get("/api/graveyard")` reaches the backend and not Crew's own `/api/*`; whether the bundle must export a `mount` function (`mountFunction` defaults to `"mount"`) or a component; whether externals resolve through the host import map.
9. **Proxy secret:** Whether `.app_secret` is created on a local install.
10. **Concurrency:** How many MCP server processes run when the cron, a Telegram chat and a dashboard chat are active together (Requirement 7.6).
11. **Run now:** `kirocrew cron trigger` on the app job, and the start delay with and without `strict_schedule`.

---

## Glossary

- **Undead**, **Zombie**, **Possessed**, **Trial trap**, **Buried**, **Tombstone**, **Graveyard**: As defined in `product.md` ("Vocabulary").
- **Core**: `@zombills/core`, used only through its public entry point, from `vendor/zombills-core`.
- **Pipeline**: For one statement text: `parseStatement`, then `normalizeTransactions`; for the merged rows of all statements: `detectSubscriptions`, then `classifySubscriptions` with the Answers of Requirement 6.6. No `asOf` option is passed, so the result depends only on the statement text.
- **App root**: The installed app directory, `~/.kiro/crew/apps/zombills-reaper/`. The MCP server finds it from its own file location; the backend gets it as its `cwd`.
- **Data dir**: `<App root>/data/`.
- **Settings file**: `<Data dir>/settings.json`, `{ "version": 1, "statementsFolder": string }`.
- **History file**: `<Data dir>/history.json`, the JSON of a **History** (Requirement 7).
- **Statements folder**: The folder named in the Settings file.
- **Statement file**: A regular file directly in the Statements folder whose name ends in `.csv` in any letter case and does not start with `.`.
- **Triple**: The `currency`, `cadence` and `merchantKey` of a subscription or record.
- **Tracked charge**: A record in the History of one recurring charge the Reaper has seen: `{ key, merchant, serviceId, currency, cadence, merchantKey, amountCents, cadenceAssumed, firstSeenScan, lastSeenScan, reportedRiseDate }`, with `key` the Core subscription `id` it was last matched to and `reportedRiseDate` the `latestRise.date` last reported as possessed, or `null`.
- **Match**: Subscriptions of a scan are matched to Tracked charges in passes. (1) `s.id === t.key`. (2) Among those left, the Qualifying candidate rule of the Zombills graveyard-memory spec: same Triple, `s.priceHistory` holds an entry with `amountCents === t.amountCents`, and `!s.cadenceAssumed || t.cadenceAssumed`; a pair is accepted only when `t` is the only qualifying candidate for `s` and `s` the only one for `t`. No tie-breakers. (3) Anything left is unmatched. Subscriptions are matched to Tombstones by the same passes, with the Tombstone's `key`, `amountCents` and `cadenceAssumed`. Matching is one-to-one.
- **Blocked subscription**: An unmatched subscription whose Triple is shared by a Tracked charge or Tombstone that is also left unmatched. Matching cannot tell which one it is, so it is not reported (Requirement 5.3).

  > **Amended by design review 1 #2** (`review-design-1.md`): matching runs over all of Core's subscriptions, active and ended, so an ended series takes its own record; only active subscriptions are reported or blocked. A Tracked charge blocks only when its `lastSeenScan` is the previous scan; a Tombstone blocks only when it was left unmatched because two or more subscriptions qualified for it. Older unmatched records block nothing.
- **Scan summary**: What `scan_statements` returns (Requirement 5). Only summaries, never rows.
- **Display name**: The subscription's `merchant`, trimmed, with runs of white space collapsed to one space and, WHEN longer than 80 code points, cut to 79 code points followed by "…", so it is never longer than 80 code points.
- **Money text**: An amount formatted at the edge from integer cents and an ISO 4217 code with `Intl.NumberFormat("en-US", { style: "currency", currency })`, for example "$17.99" or "£4.99".
- **Cadence factor**: 52 for weekly, 12 for monthly, 1 for yearly (as in Core).
- **Name folding**: NFC normalisation, trimming, collapsing white space, then `toLowerCase()`. Used for every case-insensitive comparison of service text.
- **Proxy check**: The verification of `X-KiroCrew-Proxy` in Requirement 11.

---

## Requirements

### Requirement 1: The `app.json` manifest (Must)

**User Story:** As a Crew user, I want to install the Reaper from its repo with one command, so that the agent, tools, cron and dashboard page all appear together.

#### Acceptance Criteria

1. THE repo root SHALL hold `app.json` with `name: "zombills-reaper"`, a semver `version` starting at `0.1.0`, `displayName: "The Reaper"` and a one-sentence `description`.
2. `app.json` SHALL declare exactly one stdio MCP server under `mcpServers`, named `reaper`, with `command: "node"`, `args: ["${HOME}/.kiro/crew/apps/zombills-reaper/mcp/dist/server.js"]` and no `env`.

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): the server entry is `{ "command": "/bin/sh", "args": ["-c", "exec node \"$HOME/.kiro/crew/apps/zombills-reaper/mcp/dist/server.js\""] }` with no `env` and no `autoApprove` (an `autoApprove` key made the server not mount, 5/5 runs).

3. `app.json` SHALL declare one agent (Requirement 8), one cron (Requirement 10), one UI entry with one page (Requirement 12) and one backend `{ entryPoint: "backend/dist/server.js", type: "node", port: "auto", healthCheck: "/api/health" }` (Requirement 11).

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): `app.json` also declares `"skills": ["skills/reaper"]`, the manifest field Crew uses to register a skill directory (`apps/manifest.py`, `skills`).

4. THE app SHALL run from the committed bundles of Requirement 2.8 with no install step. `setup.onInstall` SHALL be absent, because a local-path install does not run it. Nothing in the installed copy SHALL depend on `node_modules`.
5. `setup.configSchema` SHALL be a JSON Schema with one required string property `statementsFolder` and a `description` that says the folder is read in place and that, in Crew 0.12.2, the value is set through the Reaper agent or by editing `settings.json` (Introduction, "Decisions").
6. `permissions` SHALL be exactly `{ "cron": true, "mcpTools": ["send_message"] }`. `permissions.api` SHALL be absent.

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): `permissions` SHALL be exactly `{ "cron": true, "mcpTools": ["send_message"], "api": ["/apps/zombills-reaper/api"] }`. The `api` entry has no trailing slash (`/apps/<app>/api/` never matches). Changing it needed no re-approval.

7. `app.json` SHALL contain no token, chat id, API key, user name or statements path. The literal `${HOME}` in Criterion 2 is the only path prefix.

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): the literal `$HOME` inside the `/bin/sh -c` string of Criterion 2 replaces `${HOME}` as the only path prefix.

8. A unit test SHALL parse `app.json` and check Criteria 1 to 7 (including the exact `permissions` object), and that every file the manifest names (agent file, UI entry, backend entry point, MCP script under the App root) is committed.

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): the MCP script is found by extracting the quoted path after `exec node` in the `-c` string and replacing `$HOME/.kiro/crew/apps/zombills-reaper/` with the repo root.


### Requirement 2: Vendoring `@zombills/core` and the committed bundles (Must)

**User Story:** As the developer, I want one script that copies a built Core from my local Zombills repo, and committed bundles that run with nothing installed, so that Crew's copy of this repo works and says where its Core came from.

#### Acceptance Criteria

1. `scripts/sync-core` SHALL take the Zombills repo path from its first argument, defaulting to `../Kiroween-Hackathon` relative to this repo's root.
2. THE script SHALL run the Core build in that repo (`npm run build --workspace @zombills/core`), then replace `vendor/zombills-core/` with a copy of `packages/core/dist/` and `packages/core/package.json`, leaving out test files (`*.test.*`, `*.property.test.*`) and source maps that point outside `dist`.
3. THE script SHALL write `vendor/zombills-core/SOURCE` holding the Zombills commit hash (`git rev-parse HEAD`), `-dirty` appended WHEN that repo has uncommitted changes under `packages/core`, and the sync date as ISO `yyyy-mm-dd`.
4. THE script SHALL fail with a clear message, and leave `vendor/zombills-core/` unchanged, WHEN the path is not a Zombills repo, the build fails, or the `papaparse` version in Core's `package.json` differs from the one in this repo's `package.json`.
5. THE copy SHALL be real files. THE script SHALL NOT create a symlink, download anything or publish anything.
6. This repo's `package.json` SHALL have an empty (or absent) `dependencies`. `"@zombills/core": "file:./vendor/zombills-core"`, `papaparse` at the exact version Core names (5.7.1 today) and every other library SHALL be `devDependencies`, inlined into the bundles at build time.

   > **Amended by design review 1 #4** (`review-design-1.md`): Crew runs `npm install --production --no-audit --no-fund` in the App root at backend start (`apps/backend.py:958-998`). `package-lock.json` SHALL be committed, and the root `package.json` SHALL have no lifecycle scripts (`preinstall`, `install`, `postinstall`, `prepare` and the like). The manifest test checks both.
7. `vendor/zombills-core/` SHALL be committed and never edited by hand. *(Should)* A unit test SHALL check that `SOURCE` exists and holds a 40-character hex hash, optionally followed by `-dirty`.
8. `npm run build` SHALL use esbuild to produce three single-file ESM bundles, each committed: `mcp/dist/server.js` and `backend/dist/server.js` (platform `node`, target Node 22, every import inlined except `node:` built-ins) and `ui/dist/index.mjs` (platform `browser`, with `react`, `react-dom`, `lucide-react` and `@kirocrew/app-sdk` external and everything else inlined). The build SHALL be deterministic, and the MCP bundle SHALL embed the Core `SOURCE` hash (Requirement 7.11).
9. A CI-style test SHALL rebuild the three bundles into a temporary directory and fail WHEN any differs byte for byte from the committed file, so committed bundles are always up to date with the source.

   > **Amended by skeleton check 2026-11-17** (`spike-2026-11-17.md`): the test also regenerates `agents/reaper.json` (base prompt plus `SKILL.md` text, Requirement 8.2) and fails WHEN it differs byte for byte from the committed file.
10. A test SHALL copy `app.json`, the bundles and `agents/` to a temporary directory with no `node_modules`, start `node mcp/dist/server.js` there, and check that it answers the MCP `tools/list` request with the five tools; and start `backend/dist/server.js` with test `PORT` and `KIROCREW_PROXY_SECRET` and check `GET /api/health`.

### Requirement 3: The Statements folder setting (Must)

**User Story:** As a user, I want to tell the Reaper which folder to watch, so that it reads my statements where they already are.

#### Acceptance Criteria

1. THE MCP tool `set_statements_folder` SHALL take `{ path: string }`, expand a leading `~` to the home directory, and require an absolute path to an existing directory the server can read. WHEN it can, THE tool SHALL write the Settings file (Requirement 7.6 write rule) and return `{ ok: true, folderName, statementFileCount }`.
2. WHEN the path is not absolute after expansion, does not exist, is not a directory or cannot be read, THE tool SHALL leave the Settings file unchanged and return `{ ok: false, reason }` with `reason` one of `"not-absolute"`, `"not-found"`, `"not-a-folder"`, `"not-readable"`.
3. THE tool SHALL refuse, with `reason: "inside-app"`, a path inside the App root or the Data dir, so statements are never placed in app storage.
4. WHEN the Settings file is missing, unreadable or not version 1, every tool that needs the folder SHALL return `{ ok: false, reason: "not-configured" }` and the agent SHALL ask the user for the folder (Requirement 9.6).
5. No tool result, chat message or log line SHALL hold the full path. Tool results name the folder only by `folderName`, its last path segment. `folderName` can still hold a person's name, so the alert does not include it (Requirement 9.3).
6. THE README and the tool description of `set_statements_folder` SHALL say that the path given to the agent is a tool argument and therefore reaches the model provider and Crew's transcripts, and that editing `settings.json` by hand keeps it on the machine.

### Requirement 4: Reading and analysing statements (Must)

**User Story:** As a user, I want the Reaper to read every statement in my folder as one history, so that charges that repeat across monthly statements are found.

#### Acceptance Criteria

1. `scan_statements` SHALL read each Statement file in the Statements folder once, in place, without following symlinks, without opening sub-folders, and without writing, moving or renaming any file in that folder.
2. THE scan SHALL skip, and count by kind, a file larger than 5 MiB (`"too-large"`) and a file that cannot be read (`"unreadable"`). Core's parse outcome SHALL map as follows: `status: "mapping-required"` → `"unknown-columns"`; `"error"` with `EMPTY_CSV_REASON` or `NO_CONTENT_ROWS_REASON`, or a mapped result with no transactions → `"empty"`; any other `"error"` → `"parse-error"`; a file whose detected date format is assumed and ambiguous (dd/mm versus mm/dd) → `"ambiguous-dates"`. THE scan SHALL read at most 120 Statement files, in code-unit order of their names, and count the rest as `"too-many"`.
3. Bytes SHALL be decoded as UTF-8 with a leading BOM removed; WHEN the bytes are not valid UTF-8, as Windows-1252 (vertical-slice Requirement 3.10).
4. Each file SHALL be parsed and normalised on its own. THE normalised transactions of all files SHALL then be merged into one list before detection, removing overlap between files: transactions with the same `(date, merchant.key, amountCents, currency)` are kept as many times as they occur in the file where they occur most, not the sum over files. THE merged list SHALL be sorted by that key in code-unit order. This lets overlapping statement exports be scanned together without doubling charges; the same charge on two accounts on the same day is merged too (Out of scope).
5. THE Pipeline SHALL run on the merged list once per scan. THE Reaper SHALL NOT change, re-implement or post-process Core's detection or classification, except for the matching of Requirement 5.13 and the reporting rules of Requirement 5.
6. Parsed rows, normalised transactions, descriptions, balances, and Core's `rowErrors` including each `rawRow`, SHALL exist only in memory for the duration of one `scan_statements` call. They SHALL NOT be written to any file, returned from any tool or logged. Only `rowErrors.length` may be counted.
7. *(PBT: order independence)* FOR ALL lists of at most 120 statement texts and FOR ALL permutations of that list (and of file names), the merged transaction multiset of Criterion 4 and the resulting Scan summary (Requirement 5) SHALL be deeply equal, given the same History, apart from `scanId`.
8. *(PBT: overlap)* FOR ALL statement texts `a`, scanning the files `[a]` and `[a, a]` against the same History SHALL give the same Scan summary, apart from `scanId` and `files`.

### Requirement 5: The Scan summary (Must)

**User Story:** As the Reaper agent, I want a short, structured summary of what changed, so that I can alert the user without seeing any raw statement data.

#### Acceptance Criteria

1. `scan_statements` SHALL take no arguments and return `{ ok: true, scanId, firstScan, folderName, files: { read, skipped: { [kind]: count } }, statementRange: { from, to }, newUndead, possessed, trialTraps, risenAfterBurial, undead, yearlyTotals, historyReset, historyDropped }` or `{ ok: false, reason }`. `historyReset` and `historyDropped` are defined in Requirement 7.3 and 7.4 and are `false` and `0` otherwise.
2. Each entry of `undead` SHALL be `{ key, name, serviceId, currency, cadence, amountCents, yearlyCostCents, cadenceAssumed, labels, firstChargeDate, lastChargeDate, buried }`, built from one active Core subscription with `name` its Display name and `labels` holding only `"possessed"` and `"trial-trap"`. `undead` SHALL be sorted by `yearlyCostCents` descending, then `name`, then `key`.
3. `newUndead` SHALL list the `undead` entries that match no Tracked charge and no Tombstone in the History before this scan and are not Blocked subscriptions. WHEN `firstScan` is `true` (the History had no completed scan), `newUndead`, `possessed` and `trialTraps` SHALL be empty, `undead` is the baseline, and THE scan SHALL record every current trial trap in `reportedTrials` and every current rise as reported (`reportedRiseDate`).
4. `possessed` SHALL list `{ key, name, currency, cadence, fromAmountCents, toAmountCents, increasePerYearCents }` for each matched `undead` entry Core labels `"possessed"` whose `priceRise.latestRise` is non-null and whose `latestRise.date` is later than the matched Tracked charge's `reportedRiseDate` (or that field is `null`). `fromAmountCents` and `toAmountCents` are the two amounts of `latestRise`, and THE Reaper SHALL compute `increasePerYearCents = (toAmountCents − fromAmountCents) × Cadence factor` so the figures in an alert agree. THE scan SHALL then set `reportedRiseDate` to `latestRise.date`. A price rise is therefore reported once, even when the price later dips. Unmatched entries and Blocked subscriptions are not reported as possessed.
5. *(Should)* `trialTraps` SHALL list `{ key, name, currency, cadence, amountCents, firstFullChargeDate }` for each `"trial-trap"` entry not already in `reportedTrials`, and THE scan SHALL add it there.
6. *(Should)* `risenAfterBurial` SHALL list `{ key, name, currency, amountCents, buriedAt, lastChargeDate }` for each subscription that matches a Tombstone (not a Blocked subscription) and whose `lastChargeDate` is more than 3 days after the Tombstone's `buriedAt`, to allow for posting lag, and after its `risenReportedThrough` when that is not `null`. This tells the user a buried service is still charging. THE scan SHALL then set the Tombstone's `risenReportedThrough` to that `lastChargeDate`, so each later charge is reported once.
7. `yearlyTotals` SHALL be `{ [currency]: { yearlyCostCents, guessedCount } }`: `yearlyCostCents` is the sum of `yearlyCostCents` of that currency's `undead` entries whose `cadenceAssumed` is `false`, and `guessedCount` the number left out because their cadence is guessed. Amounts are never added across currencies.
8. THE result SHALL contain no transaction row, description, balance, account number, file name, full path or one-off purchase. Every string in it SHALL be a Core id or key, a Display name, an ISO currency code, a cadence, a label, an ISO date, `folderName` or a reason code.

   > **Amended by design review 1 #3** (`review-design-1.md`): no tool result SHALL hold a Core id, a `key` or a `merchantKey`, because for an unidentified merchant they keep description residue (phone numbers, references) that the Display name hides. Where an entry needs an identifier it carries `ref`, the first 12 hex characters of the sha256 of its key. The allowed strings are therefore a `ref`, a Display name, an ISO currency code, a cadence, a label, an ISO date, `folderName`, the `scanId` or a reason code. This replaces `key` with `ref` in the entries of Criteria 2, 4, 5 and 6, and in the `tombstone` of Requirement 6.2 and the Tombstones of Requirement 6.8, which also leave out `merchantKey`. `key` and `merchantKey` stay in the History. Property 5.11 (P4) also covers unidentified merchants with residue in their key.

9. `ok: false` reasons SHALL be `"not-configured"`, `"folder-missing"`, `"no-statements"` (no Statement file was read successfully), `"history-unreadable"`, `"history-newer"` and `"history-busy"` (Requirement 7). On `ok: false` THE History SHALL NOT change.

   > **Amended by design review 1 #11** (`review-design-1.md`): every tool may also return `"internal-error"` when a handler throws; the result then carries no message or stack trace.
10. *(PBT: re-scan is quiet)* FOR ALL statement sets, scanning twice in a row with no file change SHALL give a second Scan summary whose `newUndead`, `possessed`, `trialTraps` and `risenAfterBurial` are empty, and whose `undead` and `yearlyTotals` equal the first.
11. *(PBT: summaries only)* FOR ALL generated statements in which every description holds a unique marker string, and every one-off amount differs from every recurring amount and every yearly cost, no marker SHALL appear in the JSON of the Scan summary unless Core's normaliser kept it in the `merchant` of a recurring charge; and no balance or one-off amount SHALL appear.
12. *(PBT: totals)* FOR ALL Scan summaries, each `yearlyTotals[c]` SHALL equal the sums defined in Criterion 7, and each entry's `yearlyCostCents` SHALL equal the `yearlyCostCents` of the Core subscription it came from.
13. AFTER a successful scan, THE History SHALL be updated in one write (Requirement 7.6): each matched `undead` entry updates its Tracked charge (`key`, `amountCents`, `cadenceAssumed`, `lastSeenScan`, `reportedRiseDate`); each unmatched entry that is not a Blocked subscription adds a new one; a Blocked subscription changes nothing; Tracked charges not seen are kept unchanged; a Scan record `{ scanId, scannedAt, statementRange, undeadCount, yearlyTotals, newCount, possessedCount }` is appended. Matching follows the Glossary "Match" passes, so no Tracked charge or Tombstone is matched by more than one subscription per scan and no tie-breaker picks between candidates.

   > **Amended by design review 1 #1** (`review-design-1.md`): a new Tracked charge SHALL record `reportedRiseDate` = its current `latestRise.date` (or `null`) on every scan, not only on a first scan, so a charge that is already possessed when first seen is reported once as new undead and not as possessed on the next scan.

   > **Amended by design review 1 #2** (`review-design-1.md`): matching runs over active and ended subscriptions (Glossary "Blocked subscription"). A pair with an ended subscription only updates the record's `key`, not its `lastSeenScan`; an unmatched ended subscription adds nothing.

### Requirement 6: Burying, unburying and the graveyard (Must; `unbury` Should)

**User Story:** As a user, I want to reply "bury <service>" and get the cancel link or a ready email, and to undo it if I change my mind, so that stopping a charge takes one step.

#### Acceptance Criteria

1. THE MCP tool `bury` SHALL take `{ service: string }` and resolve it against the **Current charges**, the Tracked charges whose `lastSeenScan` is the latest successful scan, comparing with Name folding: first to `serviceId`, then to the Display name (`merchant`), then to a Display name that starts with the text. WHEN the text ends with an amount (for example "Spotify 16.99" or "Spotify $16.99"), THE tool SHALL resolve the rest as above and keep only the entries whose `amountCents` equals that amount. WHEN no scan has succeeded yet, `bury` SHALL return `{ ok: false, reason: "no-scan" }`. Text longer than 200 code points SHALL return `{ ok: false, reason: "not-found", candidates: [] }`.

   > **Amended by design review 1 #9** (`review-design-1.md`): the whole text is resolved as a name first; a trailing amount is split off only when that finds nothing, so "bury Xbox 360" finds "Xbox 360".

2. WHEN exactly one entry matches, `bury` SHALL add a Tombstone `{ key, name, serviceId, currency, cadence, amountCents, cadenceAssumed, yearlySavingCents, buriedAt, risenReportedThrough: null }`, with `buriedAt` today's local date (`yyyy-mm-dd`) and `yearlySavingCents` = `amountCents × Cadence factor`, or `null` WHEN the cadence is guessed. It SHALL return `{ ok: true, tombstone, cancel }`.

   > **Amended by design review 1 #11** (`review-design-1.md`): the Tombstone also holds `merchantKey`, needed for its Triple in the Glossary "Match". `bury` and `unbury` also return `historyReset` and `historyDropped` when their own History load reset the file or dropped records (Requirement 7.3, 7.4). The returned `tombstone` follows the amendment to Requirement 5.8 (`ref`, no `key` or `merchantKey`).
3. `cancel` SHALL come from Core's `getCancelHelp(serviceId, currency)`: WHEN its kind is `"link"`, `{ kind: "link", url, host, steps, appStoreMayApply }`; otherwise `{ kind: "email", subject, body, mailto }` built with `cancellationEmail` (Money text for `amountText`) and `mailtoHref`. THE Reaper SHALL NOT open the link, log in anywhere or send the email.
4. WHEN no entry matches, `bury` SHALL return `{ ok: false, reason: "not-found", candidates }`; WHEN several match, `{ ok: false, reason: "ambiguous", candidates }`. `candidates` SHALL hold at most 5 entries `{ name, amountText, cadence }` (Display name, Money text, cadence), taken only from the Current charges, closest first, so two services with the same name can be told apart. THE Reaper SHALL never name a service the statements do not contain.
5. WHEN the entry already matches a Tombstone by the Glossary "Match" rule, `bury` SHALL return that Tombstone and the `cancel` draft again, with `alreadyBuried: true`, and add nothing.
6. A Tombstone SHALL count as the answer `"not-using"` for its subscription in later scans (passed to `classifySubscriptions` by the subscription's current id), so Core may label it `"zombie"` and alerts may then call it a zombie.
7. *(Should)* THE MCP tool `unbury` SHALL take `{ service: string }`, resolve it against the Tombstones the same way, remove the matched Tombstone and return `{ ok: true, name }`, or `{ ok: false, reason: "not-found" | "ambiguous", candidates }` with candidates from the Tombstones.
8. THE MCP tool `list_graveyard` SHALL take no arguments and return `{ ok: true, tombstones, savings, months }`: the Tombstones newest first; and `savings` as `{ [currency]: { yearlySavingCents, guessedCount } }`, the sum of non-null `yearlySavingCents` plus the count of guessed ones. *(Should)* `months` holds one entry per calendar month that holds a scan or burial, oldest first, with `{ month, undeadCount, yearlyTotals, buriedCount, cumulativeSavings }`: `undeadCount` and `yearlyTotals` come from that month's last Scan record, or are carried forward from the latest earlier month WHEN the month has no scan, or are `null` WHEN no earlier scan exists; `buriedCount` and `cumulativeSavings` come from the Tombstones buried up to the month's end. Calendar months use the system time zone of the machine running Crew.
9. `bury` and `unbury` SHALL write the History once each (Requirement 7.6) and SHALL NOT read the Statements folder.
10. *(PBT: bury round trip; Should)* FOR ALL Histories and FOR ALL Current charges `e` that are not buried and whose Display name resolves only to `e`, `bury(e.merchant)` then `unbury(e.merchant)` SHALL give a History deeply equal to the one before, except for Scan records, which do not change.
11. *(PBT: savings)* FOR ALL sequences of `bury` and `unbury` calls, `savings[c].yearlySavingCents` SHALL equal the sum of non-null `yearlySavingCents` of the Tombstones in currency `c`, and no Tombstone `key` SHALL occur twice.

### Requirement 7: The History file (Must)

**User Story:** As a user, I want the Reaper to remember what it has seen and buried between months, and to keep working when that memory is damaged, so that a bad file never stops alerts or loses my graveyard silently.

#### Acceptance Criteria

1. THE History SHALL be `{ version: 1, coreSource, trackedCharges, tombstones, scans, reportedTrials }` stored as JSON in the History file, with money in integer cents and dates as ISO strings. It SHALL hold only the fields named in the Glossary and Requirements 5.13 and 6.2. `reportedTrials` holds the `key`s already reported as trial traps; `coreSource` is the Core `SOURCE` hash of the last scan (Criterion 11).

   > **Amended by design review 1 #11** (`review-design-1.md`): a Tombstone also holds `merchantKey` (Requirement 6.2).
2. WHEN the History file is missing, THE Reaper SHALL treat the History as empty (`firstScan` true).
3. WHEN the History file is not JSON, not an object, has a `version` that is missing, not an integer or less than 1, or has `version` 1 and fails the schema check, THE Reaper SHALL rename it to `history.unreadable-<yyyymmddThhmmss>.json` in the Data dir, keep at most the 3 newest such files, start from an empty History and report `historyReset: true` in the next Scan summary, so the agent can tell the user their graveyard had to be started again.

   > **Amended by design review 1 #11** (`review-design-1.md`): WHEN the reset (or the drop of Criterion 4) happens during a `bury` or `unbury`, that tool reports it in its own result, and the next Scan summary reports `false` / `0`.
4. *(Should; without it any failing record triggers Criterion 3)* The schema check SHALL drop, not reject the file for, an individual Tracked charge, Tombstone or Scan record that fails its own check (wrong types, non-integer or negative cents, bad date, unknown cadence, merchant over 80 code points), and SHALL report the number dropped as `historyDropped` in the next Scan summary. Before the first write that drops records, THE Reaper SHALL copy the original file to `history.backup-<yyyymmddThhmmss>.json`, keeping at most the 3 newest.
5. WHEN `version` is an integer greater than 1, every tool SHALL return `{ ok: false, reason: "history-newer" }` and SHALL NOT write or rename the file.
6. Every write of the History or Settings file SHALL write the full JSON to a temporary file in the Data dir, `fsync` it, and rename it over the target, so a reader never sees a half-written file. Each read-modify-write of the History SHALL hold a cross-process lock: `history.lock` in the Data dir, created with `O_CREAT | O_EXCL`, removed when done, and taken over WHEN older than a stale timeout set in design. WHEN the lock cannot be taken within a wait time set in design, the tool SHALL return `{ ok: false, reason: "history-busy" }` and change nothing. A test SHALL run a scan and a `bury` in two processes at once and check that neither update is lost.
7. *(Should)* THE History SHALL keep at most the 36 newest Scan records and at most 1,000 Tracked charges and 1,000 Tombstones; beyond that the oldest are dropped.
8. THE Data dir SHALL be created with mode 0700 WHEN missing. Files the Reaper creates in it SHALL have mode 0600.
9. *(PBT: codec round trip)* FOR ALL valid Histories `h`, including merchants and names of exactly 80 code points and Display names cut from longer text, `decode(encode(h))` SHALL deeply equal `h`.
10. *(PBT: decode is total)* FOR ALL strings `s`, `decode(s)` SHALL NOT throw and SHALL return one of `ok`, `unreadable` or `newer`; a `__proto__` key SHALL NOT change any prototype.
11. *(Should)* WHEN the Core `SOURCE` hash embedded in the MCP bundle differs from the History's `coreSource`, the next scan SHALL re-baseline: it behaves as a first scan for reporting (Requirement 5.3), rebuilds `trackedCharges` from the current subscriptions, keeps the Tombstones, re-matches them by the Glossary "Match" rule, and stores the new `coreSource`. This stops a Core change to `merchantKey` from flooding new undead.

### Requirement 8: The Reaper agent (Must)

**User Story:** As a user, I want one agent that knows how to scan, alert and bury, and can do nothing else, so that it stays predictable.

#### Acceptance Criteria

1. `agents/reaper.json` SHALL define the agent `reaper` with a `description`, a `prompt` and `tools` limited to `@kirocrew-core` (for `send_message`) and the Reaper MCP server's five tools. It SHALL have no `model` field, so Crew's default model is used.

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): `tools` SHALL be exactly `["@kirocrew-core", "@zombills-reaper:reaper"]` (app servers are namespaced `<app>:<server>`; `@reaper` dangles silently) and the agent SHALL have `allowedTools` holding `"@zombills-reaper:reaper"`, because a mounted tool that is only in `tools` is rejected in an unattended cron run. Whether `send_message` also needs an `allowedTools` entry is part of the Telegram test (design, "Telegram test"). Crew materialises the agent as `~/.kiro/agents/zombills-reaper--reaper.json` and adds a `managedToolPolicy.exclude` list.

2. THE prompt SHALL tell the agent to: use only the Reaper MCP tools for statement facts; never read, list or search the Statements folder, the Data dir or any statement file with `read`, `glob`, `grep` or any tool other than the Reaper MCP tools; never paste a tool result as raw JSON into a chat; never send the folder path anywhere; and follow the skill of Requirement 9.

   > **Amended by skeleton check 2026-11-17** (`spike-2026-11-17.md`, "Skeleton checks"): the skill cannot be loaded in an unattended cron run (`load_resource` is rejected). THE prompt of `agents/reaper.json` SHALL therefore hold the full text of `skills/reaper/SKILL.md` (front-matter stripped), appended to the base prompt by `scripts/build.ts`, so "follow the skill" means "follow the skill text in this prompt". The generated `agents/reaper.json` is committed and covered by the freshness test (Requirement 2.9). `SKILL.md` remains for dashboard chats.
3. THE agent SHALL NOT be granted shell, file-write, web fetch or web search tools. Because Crew mounts `read`, `glob` and `grep` into every agent regardless (Introduction, "Privacy"), Criterion 2 is enforced by instructions, not by Crew. THE live spike (Open question 5) SHALL list the agent's real tool surface from the materialized `~/.kiro/agents/zombills-reaper--reaper.json`, and design and the README SHALL record it and name any file tool present as a limit only the prompt guards.

   > **Amended by live check 2026-11-17, task 30** (`spike-2026-11-17.md`, "Final check"): `send_message` is rejected in an unattended cron run unless granted, so `allowedTools` SHALL be exactly `["@zombills-reaper:reaper", "@kirocrew-core/send_message"]`. No other `@kirocrew-core` tool, and not the bare `@kirocrew-core` group, SHALL be auto-approved. `scripts/build.ts` sets it in the generated `agents/reaper.json`, and `app-manifest.test.ts` pins it. This resolves the "whether `send_message` also needs an `allowedTools` entry" question of Criterion 1's amendment: it does. The grant does not widen the tool surface: `send_message` was already mounted through `tools`.
4. `app.json` `agents[]` SHALL reference this file by path, and a unit test SHALL check that its `tools` list holds nothing beyond Criterion 1 and that the prompt holds the prohibitions of Criterion 2.

### Requirement 9: The skill, the wording and Telegram delivery (Must)

**User Story:** As a user, I want short messages that are a little spooky but always plain about what was found and what to do, so that I act on them and am never frightened.

#### Acceptance Criteria

1. `skills/reaper/SKILL.md` SHALL have front-matter `name: reaper`, a `description`, `triggers` including `bury`, `unbury`, `graveyard`, `scan my statements` and `reaper`, and `always: false`.

   > **Amended by skeleton check 2026-11-17** (`spike-2026-11-17.md`): this skill is not loaded in cron runs; its text reaches the cron agent through the generated agent prompt (Requirement 8.2). Criteria 2 to 11 therefore bind the text of `SKILL.md` wherever it is read, as a loaded skill or as part of the prompt, and a test SHALL check that the generated prompt ends with the skill body.
2. THE skill SHALL describe the monthly round, which the cron message starts: call `scan_statements`; WHEN `newUndead`, `possessed`, `trialTraps` or `risenAfterBurial` is non-empty, or `firstScan` or `historyReset` is true, send one message with `send_message` (`session: "telegram"`) and also reply with the same text; otherwise send nothing to Telegram and reply "All quiet in the graveyard this month." WHEN the user asks for a scan in a chat, THE agent SHALL run the same tool and reply in that chat only.
3. THE alert SHALL hold, per item, only: the Display name, old and new price as Money text, the cadence, and the yearly cost as Money text. It SHALL end with the line "Reply \"bury <name>\" and I will draft the cancellation." It SHALL hold no date range, file count, folder name, link or email unless the user asked.
4. Alert examples (amounts from the demo set of Requirement 14 are fixed in design):

   ```
   🦇 The Reaper's monthly round
   New undead: Paramount+, $11.99 a month ($143.88 a year).
   Possessed: Netflix went from $15.49 to $17.99 a month (+$30.00 a year).
   Reply "bury <name>" and I will draft the cancellation.
   ```

   ```
   🦇 First count: 6 undead, $1,104.36 a year in USD.
   I will tell you when something new rises or a price goes up.
   ```

5. Wording SHALL use "new undead", "possessed", "trial trap", "buried" and "tombstone". It SHALL say "zombie" only for a service the user has buried. It SHALL NOT use exclamation points, threats, urgency ("act now", "before it's too late"), or claims the Reaper cannot back (that a charge is unused, a fraud, or will rise again).
6. WHEN a tool returns `"not-configured"` or `"folder-missing"` in a chat, THE agent SHALL ask the user in that chat which folder to watch, say the folder is read where it is and never uploaded, and mention that editing `settings.json` by hand keeps the path off the model provider (Requirement 3.6). WHEN this happens in the monthly round, THE agent SHALL send one Telegram message that carries no data: "The Reaper has no statements folder yet. Set it in the Crew dashboard chat."
7. ON "bury <service>", THE agent SHALL call `bury`. WHEN `ok`, it SHALL reply with the Tombstone line ("⚰️ Netflix is buried. You save $215.88 a year.") and the draft: for a link, the URL and up to 3 steps; for an email, the subject and body as a block the user can copy, and the `mailto:` link. It SHALL say that the user still has to cancel with the service. WHEN `not-found` or `ambiguous`, it SHALL list the candidates with name, price and cadence and ask which one, accepting a reply such as "bury Spotify 16.99". It SHALL never guess a service.
8. ON "unbury <service>", THE agent SHALL call `unbury` and confirm in one line. ON "graveyard", it SHALL call `list_graveyard` and reply with the Tombstones and the yearly savings per currency.
9. ON `risenAfterBurial`, THE message SHALL say plainly that the service charged again after it was buried and that the cancellation may not have gone through.
10. THE skill SHALL NOT restate detection or classification rules; it refers to tool results only.
11. THE skill SHALL repeat the prohibition of Requirement 8.2: statement facts come only from the Reaper MCP tools, and the agent never reads, lists or searches statement files with `read`, `glob`, `grep` or any other tool.

### Requirement 10: The monthly cron and running it now (Must)

**User Story:** As a user, I want the scan to run by itself on the first of each month, and as a demo presenter, I want to run it on demand.

#### Acceptance Criteria

1. `app.json` `crons[]` SHALL hold one entry `{ name: "Graveyard watch", cron_expr: "0 9 1 * *", agent: "reaper", message, silent: true, strict_schedule: true, persistent_session: false, enabled: true }` with no `timezone`, so it fires at 09:00 on the 1st in the zone set in Crew (then UTC), with no random start delay and no context carried between months. The `agent` value SHALL be the name Crew resolves to this app's agent; the 0.12.2 source registers app agents as `zombills-reaper/reaper` (`apps/bridges_agents.py`) and passes the cron's `agent` through unchanged (`apps/bridges_crons.py`), so design SHALL confirm on a real install whether the bare or the namespaced name works. (Amended 2026-11-17: user chose the name Graveyard watch for the phone footer)

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): the bare name `reaper` works: the manifest `"agent": "spike"` became cron `agent_id: "spike"` and ran with that agent. The cron is named `zombills-reaper/Graveyard watch`.

2. `message` SHALL ask the agent to run the monthly round of the `reaper` skill. It SHALL hold no path, name or amount.
3. THE README SHALL document running it now: `kirocrew cron list` to find the id of `zombills-reaper/Graveyard watch`, then `kirocrew cron trigger <id>`; and, as an alternative, sending "scan my statements" to the Reaper agent, which runs the same flow.
4. A unit test SHALL check Criteria 1 and 2 against `app.json`.

### Requirement 11: The dashboard backend (Should)

**User Story:** As a user, I want the dashboard to read my graveyard from a backend only Crew can call, so that no other local program can read it.

#### Acceptance Criteria

1. THE backend SHALL be a `node:http` server, bundled to `backend/dist/server.js` (Requirement 2.8), that listens on `127.0.0.1` at the port in `PORT` and finds the Data dir as `<cwd>/data`.
2. WHEN `PORT` is not an integer from 1 to 65535, or `KIROCREW_PROXY_SECRET` is missing or empty, THE backend SHALL log one line naming which variable is wrong (never its value) and exit with a non-zero code.
3. `GET /api/health` SHALL return `200 {"ok":true}` without the Proxy check and SHALL hold no other data.
4. Every other request SHALL pass the Proxy check before any file is read: the `X-KiroCrew-Proxy` header is `<ts>:<hex>`; `<ts>` is an integer within 60 seconds of the server clock; and `<hex>` equals HMAC-SHA256(`KIROCREW_PROXY_SECRET`, `<ts>:<METHOD>:<raw request target>:<sha256 hex of the body>`), compared in constant time. On failure THE backend SHALL return `401 {"error":"unauthorized"}`.

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): the Proxy check verifies the **v2** scheme: headers `X-KiroCrew-Proxy-Nonce` (exactly 32 lowercase hex) and `X-KiroCrew-Proxy-V2: <ts>:<hex>` with `<ts>` ASCII digits (at most 12), within ±60 s of the server clock, and `<hex>` = HMAC-SHA256(secret, `v2:<ts>:<nonce>:<METHOD>:<raw request target>:<sha256 hex of body>`), compared in constant time, and the nonce accepted at most once by a process-lifetime replay cache. The v1 header is ignored. Exact algorithm in design ("Proxy check v2").

5. `GET /api/graveyard` SHALL return the `list_graveyard` result of Requirement 6.8 plus `{ lastScan: { scannedAt, statementRange, undeadCount, yearlyTotals } | null }`, computed from the History file by the same shared code the MCP server uses (Requirement 15.2). It SHALL return `{ ok: false, reason }` with `"history-unreadable"` or `"history-newer"` and SHALL NOT rename, repair or write the History file.
6. THE backend SHALL be read-only: it SHALL NOT write any file, and SHALL answer every method other than `GET` with `405`, and every other path with `404`, both after the Proxy check.
7. THE backend SHALL NOT read the Statements folder or the Settings file, and SHALL make no outbound request.
8. Request bodies over 16 KiB SHALL be refused with `413` without being read further.
9. *(PBT: proxy check)* FOR ALL secrets, methods, targets, bodies and timestamps, the check SHALL accept exactly the header computed by a reference signer from the same values within ±60 s, and SHALL reject any header in which one character of the timestamp or signature differs, the method, target or body differs, or the timestamp is outside the window.

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): the reference signer is the v2 signer; a mutated nonce, a nonce of the wrong shape and a replayed nonce are rejected too.


### Requirement 12: The dashboard page (Should)

**User Story:** As a user, I want a page in Crew that shows the graveyard over time and what I have saved, so that I can see the Reaper working month after month.

#### Acceptance Criteria

1. `ui.entry` SHALL be `"dist/index.mjs"` (relative to `ui/`), the committed esbuild bundle of Requirement 2.8 built from `ui/src`, with `react`, `react-dom`, `lucide-react` and `@kirocrew/app-sdk` external. `ui.pages` SHALL hold one page `{ route: "/graveyard", label: "Graveyard", icon }` with a Lucide icon name chosen in design.

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): the bundle SHALL export a React function component named `mount` (and the same as default); the host renders it as a component, and a DOM-style `mount(el)` crashes. Bare imports of `react` and `@kirocrew/app-sdk` resolve through the host import map; `lucide-react` and `react-dom` were not tested and the page SHALL NOT import them. The page route SHALL be `/apps/zombills-reaper` (the form Crew documents and the spike used), not `/graveyard`.

2. THE page SHALL load its data only with `useAppApi` from `GET /api/graveyard`, and SHALL show a loading state, an error state ("The graveyard could not be read.") with a retry button, and an empty state ("Nothing buried yet. The Reaper checks your statements on the 1st of each month.").

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): the path SHALL be `/apps/zombills-reaper/api/graveyard`; `api.get("/api/…")` is refused as Crew's own namespace.

3. WHEN data is present, THE page SHALL show: the yearly savings per currency (Money text) as the headline; a month-by-month timeline, oldest to newest, of undead count, yearly cost per currency and cumulative savings, as an equivalent table for screen readers and *(Should)* as a chart; the Tombstones, newest first, with name, Money text per charge and cadence, yearly saving and burial date; and the date of the last scan.
4. A guessed-cadence Tombstone SHALL show "saving not counted (cadence guessed)" and SHALL NOT count in totals.
5. THE page SHALL load no font, image, style or script from any host. Names SHALL be shown as text only, with no logos.
6. THE page SHALL meet WCAG AA contrast and work by keyboard; the chart SHALL NOT be the only way to read a number.
7. Copy SHALL follow the tone of Requirement 9.5.
8. Component tests SHALL cover each state of Criterion 2, the data view of Criterion 3 with two currencies, and Criterion 4, with `useAppApi` mocked.

### Requirement 13: Privacy checks (Must)

**User Story:** As a user, I want the privacy promise checked by tests, so that a later change cannot quietly break it.

#### Acceptance Criteria

1. A test SHALL scan the source of `mcp/`, `backend/`, `ui/`, `scripts/` and the shared module for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `http.request`, `https.request`, `http.get`, `https.get`, `net.connect`, `tls.connect`, `dgram`, `dns` and `EventSource`, and for `child_process` outside `scripts/`, and SHALL fail on any match outside test files. `scripts/sync-core` may spawn `npm` and `git` on the local repo only. ESLint SHALL also enforce this with `no-restricted-imports` (which catches destructured imports that text search misses), and with `no-console` in `mcp/`.
2. A test SHALL run `scan_statements` on the demo set with `globalThis.fetch`, `http.request`, `https.request` and `net.connect` replaced by functions that fail the test when called.
3. *(Should)* A test SHALL capture everything the MCP server and backend write to stdout (except MCP protocol frames) and stderr during a scan, a bury and a `GET /api/graveyard`, and SHALL fail WHEN it contains any description, amount, merchant name or the Statements folder path from the demo set.
4. A test SHALL check that after a scan the only files the Reaper wrote in the Data dir are `settings.json`, `history.json`, `history.lock` while held, and allowed `history.unreadable-*.json` and `history.backup-*.json` files (files Crew writes there itself are ignored), and that the Statements folder's file names, sizes and modification times are unchanged.
5. `package.json` SHALL add no dependency beyond those in `tech.md` ("Approved stack"), plus esbuild as a build-only dev dependency, and their own dependencies. Every new dependency SHALL be named in design with a note on its network behaviour.

### Requirement 14: README and demo statements (Must)

**User Story:** As a judge or new user, I want to install the Reaper and see it find something within minutes, without using my own bank data.

#### Acceptance Criteria

1. `README.md` SHALL explain what the Reaper does, the privacy promise in three sentences, and install steps for the local Mac: install Crew 0.12.2, install from local path (`POST http://localhost:5476/api/apps/install {"source": "<path>"}` then enable, or App Store → Install from local path; the committed bundles need no build, and `npm ci && npm run build` is needed only after changing source), connect Telegram in the Crew Gateway, route the Telegram DM to the Reaper agent (Introduction, "Decisions"), set Crew's timezone, and tell the Reaper agent which folder to watch or edit `settings.json` (Requirement 3.6). It SHALL say to keep earlier statements in the folder, because detection needs repeated charges, and that the same charge on two accounts on the same day is counted once (Requirement 4.4). It SHALL state the agent's real tool surface and the limit of Requirement 8.3.

   > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): install is `kirocrew app install <repo path>`; the CLI refuses to enable a third-party app, so the README SHALL tell the user to enable it in the dashboard (Apps → Library → The Reaper → Enable) and SHALL NOT suggest setting `agent.apps_allow_third_party`. After a source change: `kirocrew app update zombills-reaper`. Telegram routing is `/agent reaper` in the bot chat, pending the Telegram test.

   > **Amended by design review 1 #15** (`review-design-1.md`): the install step SHALL tell the user to check that `<repo>/data` does not exist before installing, because a first install copies the source's `data/` into the installed app (`apps/manager_install.py:385`). Amended by design review 1 #5: the privacy text names the transcript stores of Requirement 15.3.

2. THE README SHALL have a "Later: your own EC2 instance" section for `kirocrew cloud`, saying the statements folder and Data dir then live on that instance, and that the same rules apply (no S3, no log shipping of app data).
3. THE README SHALL have a demo section: copy `mcp/fixtures/demo/round-1/*.csv` into a new folder, set it as the Statements folder, run the cron now (Requirement 10.3) and see the first count; then copy `mcp/fixtures/demo/round-2/*.csv` in, run it again and see one new undead and one possessed charge; reply "bury <name>" and see the draft.
4. THE demo files SHALL be fake and anonymised, in the US signed-amount format Core reads with Core's sign convention (positive = money out), with no real person, account number or address. A test SHALL assert Core's `detectedSignConvention` for each demo file, then scan round 1, then round 1 plus round 2, against a fresh History, and SHALL assert `firstScan` on the first, and exactly one `newUndead` and one `possessed` entry on the second, naming services from the cancel-helper data so that one bury gives a link and the README shows an email case too.
5. THE README SHALL list what the Reaper never does (cancel for the user, send email, upload statements) and a troubleshooting entry for MCP tools not showing (for example `node` not found by kiro-cli, or a `KIROCREW_HOME` other than `~/.kiro/crew`).
6. THE README and the repo SHALL hold no bot token, chat id or real statement.

### Requirement 15: Repo layout, tooling and steering corrections (Must)

**User Story:** As the developer, I want the repo to follow its steering and the steering to match the real Crew, so that later Kiro work is not misled.

#### Acceptance Criteria

1. THE repo SHALL follow `structure.md`: `app.json`, `agents/`, `skills/`, `mcp/src/`, `backend/src/`, `ui/src/`, `vendor/zombills-core/`, `scripts/`, `mcp/fixtures/`. Files are kebab-case; MCP tool names are snake_case. `.kiro/` SHALL NOT be gitignored.
2. THE History types and codec, the Settings codec, the graveyard summary of Requirement 6.8 and the Money text formatter SHALL live in one shared module imported by `mcp/`, `backend/` and `ui/` (types only in `ui/`). Its location is decided in design.

   > **Amended by design review 1 #11** (`review-design-1.md`): `ui/` imports the types and the Money text formatter (`moneyText`), so the page formats amounts exactly as the alerts do.
3. THE steering files SHALL be corrected in the same change, citing the source paths of the Introduction:
   - `tech.md` and `privacy.md`: replace `X-Crew-Proxy` with `X-KiroCrew-Proxy`.

     > **Amended by spike 2026-11-17** (`spike-2026-11-17.md`): the backend verifies `X-KiroCrew-Proxy-V2` with `X-KiroCrew-Proxy-Nonce`; `tech.md` also records the `/bin/sh -c` MCP launch, `@<app>:<server>` tool references with `allowedTools`, no `autoApprove`, `permissions.api` without trailing slash, the page exporting a React component `mount`, and enabling third-party apps in the dashboard.

   - `tech.md`: `setup.configSchema` values do not reach apps in 0.12.2; how stdio MCP servers are launched (session cwd, stripped env, `${HOME}` expansion in `args`); the backend env (`PORT`, `KIROCREW_PROXY_SECRET`, cwd = App root); crons may set `silent`, `timezone`, `strict_schedule` (without it, a random start delay of up to 59 minutes) and `persistent_session`; `agents[]` holds paths, not objects; `onInstall` does not run on a local-path install and `onUpdate` is never dispatched; `node_modules` is dropped from the installed copy, hence the committed esbuild bundles with zero runtime `dependencies` (replacing "Vite library build" and "`onInstall` must install dependencies and build"); `permissions.cron` is required when `crons` is declared; `permissions.mcpTools` is enforced; `ui.entry` is relative to `ui/`.
   - `structure.md`: the MCP tool list (`scan-statements`, `draft-cancellation`) becomes the five tools of this spec.
   - `product.md` and `privacy.md`: replace "statements path lives in app config (`setup.configSchema`)" with the Settings file.
   - `privacy.md`: state that Crew mounts built-in `read`, `glob` and `grep` into every agent, so "statements are read only through the Reaper MCP tools" is enforced by the agent prompt and skill, not by Crew; note that a path set through the agent reaches the model provider; and add a row for alert text stored by Crew in `~/.kiro/crew/cron-history`.

     > **Amended by design review 1 #5** (`review-design-1.md`): `privacy.md` and the README privacy text SHALL also name the two transcript stores that hold every tool result and any path passed to `set_statements_folder`: kiro-cli's `<kiro home>/sessions/cli/<sid>.jsonl` and Crew's `data_home()/sessions`, as a limit on "summaries only".
4. THE repo SHALL use TypeScript strict, ESM, Node 22, Vitest and fast-check, ESLint and Prettier as `tech.md` says, with `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` at the root. `npm test` SHALL NOT need the Zombills repo, Crew or a network.
5. `.gitignore` SHALL ignore `node_modules/`, temporary build output and any local `data/` folder, and SHALL NOT ignore `vendor/`, `.kiro/` or the committed bundles `mcp/dist/server.js`, `backend/dist/server.js` and `ui/dist/index.mjs`.

### Requirement 16: Correctness properties (Must; 16.11 Should)

**User Story:** As the team, I want the key properties listed in one place, so that Kiro's property tests cover them.

#### Acceptance Criteria

Each property SHALL be a fast-check test in a `.property.test.ts` file next to its source:

1. *(PBT)* Order independence of a scan (Requirement 4.7).
2. *(PBT)* Overlapping files are not double counted (Requirement 4.8).
3. *(PBT)* A re-scan of unchanged input reports nothing new (Requirement 5.10).
4. *(PBT)* Scan summaries leak no description, balance or one-off amount (Requirement 5.11).
5. *(PBT)* Totals equal their parts (Requirement 5.12).
6. *(PBT)* Matching is one-to-one and uses no tie-breaker: in every scan, no Tracked charge or Tombstone is matched by two subscriptions and no subscription by two records, and a subscription with two qualifying candidates is left unmatched (Requirement 5.13).
7. *(PBT; Should)* Bury then unbury restores the History (Requirement 6.10).
8. *(PBT)* Savings equal the sum of Tombstones, with no duplicate key (Requirement 6.11).
9. *(PBT)* The History codec round-trips (Requirement 7.9) and decode is total (Requirement 7.10).
10. *(PBT)* The Proxy check accepts exactly correct signatures (Requirement 11.9).
11. *(PBT: idempotent update; Should)* FOR ALL Histories `h` and statement sets, applying the History update of one scan and then of a second scan of the same set SHALL give the same `trackedCharges` (apart from `lastSeenScan`), `tombstones` and `reportedTrials` as one scan.
