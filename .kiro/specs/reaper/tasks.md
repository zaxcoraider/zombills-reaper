# Implementation Plan: reaper

Tasks run in dependency order. They follow design "Task order (walking skeleton first)", with the splits of review-design-1 #6. Some design steps are split further so that each Kiro task fits one run; each batch heading names the design steps it covers. Paths are relative to the repo root. Property IDs (P1–P12) refer to design "Correctness properties", and every property test's name starts with its ID (e.g. `"P9: decode(encode(h)) is h"`).

Tasks marked **(Claude Code)** need the live Crew 0.12.2 or Telegram: install, enable, `kirocrew cron trigger`, and the Telegram tests T1–T8 of design "Telegram test". Claude Code runs them by hand and appends the results to `.kiro/specs/reaper/spike-2026-11-17.md`. No Kiro task waits on them. When a Kiro task uses one of their results, it reads the spike file: if the section exists, it applies the fallback recorded there; otherwise it writes the design default. Its tests accept every form that design "Telegram isolation" names.

Test policy:

- Each Kiro task runs the tests it names with `npx vitest run <files>` at the repo root, plus `npm run typecheck` and `npm run lint`. All of these must pass at the end of the task.
- From task 3 on, a task that changes any file under `shared/src/`, `mcp/src/`, `backend/src/`, `ui/src/` or `vendor/`, or the `version` in `app.json`, runs `npm run build` and adds `scripts/build-fresh.test.ts` to its test run, so the bundles on disk always match the source (Req 2.9).
- The full suite (`npm test`) runs once per batch, at the batch's "done" line, by the reviewer.
- No task may break an existing test. When a task changes an existing test, the task names it under "Existing tests"; no other existing test may change in that task. A Kiro task never needs a later task, or a Claude Code task, to make its own tests pass.

Rules that apply to every task:

- **One task per Kiro run.** Do only the task you were given. When it is done and its tests pass, tick its box (`- [x]`) and add a `Task notes:` line under it with decisions, versions chosen and anything the next task must know.
- **Targeted tests per task.** Run the tests the task names, not the whole suite, unless the task says otherwise.
- **Never weaken a test.** Do not delete, skip (`.skip`, `.todo`, `.only`), loosen or comment out an assertion, lower `numRuns`, or narrow a generator to make a test pass. If a test fails, fix the code. If the test itself contradicts `requirements.md` or `design.md`, stop and explain.
- **Stop and explain on a conflict.** When the task disagrees with `requirements.md`, `design.md`, the steering files, Core's real public API or the installed Crew 0.12.2 source, or cannot be done as written, do not work around it. Write the conflict in the task notes, leave the box unticked and end the run.
- **Do not commit.** No `git commit`, `git push`, `git stash` or branch change. Leave every change in the working tree. Because nothing is committed, "committed" in a test means listed by `git ls-files --cached --others --exclude-standard -- <path>` (tracked, or untracked and not ignored); "tracked" means `git ls-files --cached`.
- **No `npm install`, `npm ci`, `npm add` or `npx <package not installed>` unless the task says so.** Only tasks 1 and 2 install. No task adds a dependency after task 1; if one seems needed, stop and explain.
- **Privacy** (`privacy.md`, Req 13). No runtime code in `shared/`, `mcp/`, `backend/`, `ui/` or `scripts/` makes a network call or uses `child_process`, except `scripts/sync-core.ts` spawning `npm` and `git` on the local Zombills repo. No telemetry. In `mcp/` and `shared/`, nothing calls `console`; `mcp/src/log.ts` is the only writer to stderr, and nothing but the SDK transport writes to stdout. No log line holds a path, an amount, a merchant name, a description or file content. No tool result holds a transaction row, description, balance, file name, full path, Core `id`, `key` or `merchantKey`; entries carry `ref` (design "Types"). Fixtures are fake and anonymised; never copy a real statement anywhere. Never write a token, chat id or real statements path into the repo.
- **Core** is used only through the public entry point of `@zombills/core` (`file:./vendor/zombills-core`). Never edit `vendor/` by hand; only `scripts/sync-core.ts` writes it. Never re-implement Core's parsing, detection or classification.
- **Documents.** Do not edit `requirements.md`, `design.md` or `review-*.md`. Only Claude Code tasks write `spike-2026-11-17.md`. Steering files change only in task 28.
- **Money** is integer cents. Amounts are formatted only by `moneyText` in `shared/src/money.ts`; no other file divides by 100 or calls `toFixed`.
- **Code style.** TypeScript strict, ESM, Node 22. Node built-ins only with the `node:` prefix. Files kebab-case, components PascalCase, constants `SCREAMING_SNAKE_CASE`, MCP tool names snake_case. Unit tests in `*.test.ts(x)` and property tests in `*.property.test.ts` next to the source; test helpers are named `test-*.ts`. Property tests run at least 200 times, or 100 when they run the full Pipeline (design "Correctness properties"). An `any` or a cast through `unknown` needs a comment saying why. `scripts/*.ts` use erasable TypeScript only (no enums, no parameter properties) and run with `node` directly.
- **MCP handlers never throw.** Every tool handler goes through the wrapper in `mcp/src/tools.ts`, which turns a thrown error into `{ ok: false, reason: "internal-error" }` and one `logCounts("tool-error", …)` line (design "Wiring").

---

## Batch 1: tooling, Core and the build (design step 1)

The repo holds only `.kiro/` before task 1. This batch sets up the tools, vendors Core and builds three stub bundles, so every later task can rebuild and check them.

- [ ] 1. Repo tooling and privacy lint (`package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `vitest.config.ts`, `.gitignore`)
  - Check `node --version` is 22.18 or later (type stripping on by default, design "Scripts"); if not, stop.
  - Create `package.json`: `"name": "zombills-reaper"`, `"version": "0.1.0"`, `"private": true`, `"type": "module"`, `"license": "MIT"`, `"engines": { "node": ">=22.18" }`, no `dependencies` key, and `scripts` exactly `test: "vitest run"`, `typecheck: "tsc --noEmit"`, `lint: "eslint . && prettier --check ."`, `build: "node scripts/build.ts"`, `format: "prettier --write ."`. No lifecycle script (`preinstall`, `install`, `postinstall`, `prepare`, `preprepare`, `postprepare`, `prepublish`, `prepack`, `postpack`; design "Manifest", review-design-1 #4).
  - `devDependencies`, every version exact (no `^` or `~`): `papaparse` 5.7.1, `typescript` 6.0.3, `vitest` 5.1.0, `fast-check` 4.10.2, `eslint` 10.14.0, `prettier` 3.10.1, `typescript-eslint` 8.72.2, `@testing-library/react` 16.3.3, `jsdom` 31.0.1, `@types/react` 18.3.31, `@types/node` 24.19.2, `react` 18.3.1, `react-dom` 18.3.1, and the ESLint packages the Zombills root config imports, at the versions Zombills pins (`@eslint/js` 10.0.1, `eslint-config-prettier` 10.1.8). Choose and pin with `npm view <name> version`: `@modelcontextprotocol/sdk` (latest), `zod` (the range the pinned SDK names in its `peerDependencies` or `dependencies`; pin its latest matching release), `esbuild` (latest) and `@testing-library/dom` (latest 10.x). `@zombills/core` is added in task 2, because `vendor/zombills-core` does not exist yet. Record every chosen version in the task notes, and record that the design dependency table does not name `@eslint/js` and `eslint-config-prettier` (both lint-time only, no network behaviour; Req 13.5).
  - Run `npm install --no-audit --no-fund` (this task may). Keep the `package-lock.json` it creates.
  - `tsconfig.json`: `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, `target` and `lib` ES2023 plus `DOM` (for `ui/`), `module` and `moduleResolution` `NodeNext`, `noEmit: true`, `allowImportingTsExtensions: true` (design "Scripts"), `jsx: "react"`, `jsxFactory: "h"`, `jsxFragmentFactory: "Fragment"` (design "JSX"), `types: ["node"]`, `skipLibCheck: true`, `include` `["*.ts", "shared", "mcp", "backend", "ui", "scripts"]`, `exclude` `["node_modules", "vendor", "**/dist"]`. If `typecheck` needs a package not in the list above (for example `@types/react-dom`), stop and explain; do not add it.
  - `eslint.config.js` (flat config, based on the Zombills root `eslint.config.js` with `@eslint/js`, `typescript-eslint` and `eslint-config-prettier`): ignore `node_modules/**`, `vendor/**` and `**/dist/**`. Add exactly the rules of design "Privacy enforcement", row 3: `no-restricted-imports` banning `node:net`, `node:tls`, `node:dgram`, `node:dns`, `node:https`, `undici`, `ws`, `axios`, `node-fetch`, the bare built-in names (`fs`, `path`, `os`, `crypto`, `http`, `https`, `net`, `child_process` and the like; design "Build and bundles"), every `@modelcontextprotocol/sdk` subpath other than `@modelcontextprotocol/sdk/server/mcp.js` and `@modelcontextprotocol/sdk/server/stdio.js`, `node:child_process` everywhere except `scripts/sync-core.ts`, and `node:http` everywhere except `backend/src/server.ts`; `no-restricted-globals` banning `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `navigator`; `no-console: "error"` in `mcp/**` and `shared/**`. Each message cites `privacy.md`. Test files (`**/*.test.ts`, `**/*.test.tsx`) and test helpers (`**/test-*.ts`) are exempt from the `node:` built-in bans only (`node:child_process`, `node:http`, `node:https`, `node:net` and the like), because they spawn the bundles, call the backend on `127.0.0.1` and replace network functions with failing stubs (Req 13.1 scans "outside test files"). Every other rule, including the SDK-subpath and network-package bans, `no-restricted-globals` and `no-console`, applies to them too.
  - `.prettierrc` copied from the Zombills repo root; `.prettierignore` lists `node_modules`, `vendor`, `**/dist` and `package-lock.json`.
  - `vitest.config.ts`: include `**/*.test.ts` and `**/*.test.tsx`; exclude `node_modules`, `vendor` and `**/dist`; environment `node`, with `ui/**/*.test.tsx` in `jsdom` by file glob (whatever mechanism the pinned Vitest supports, e.g. `test.projects`; design "Test plan").
  - `.gitignore`: `node_modules/`, `/data/`, `*.tmp-*`, `coverage/`, `.DS_Store`. It must not ignore `vendor/`, `.kiro/`, `mcp/dist/server.js`, `backend/dist/server.js` or `ui/dist/index.mjs` (Req 15.5), so it has no `dist/` pattern.
  - SDK check (design "Dependencies", `zod` row): in a scratch file under `os.tmpdir()` (not in the repo), create an `McpServer`, register a tool whose `inputSchema` is `z.object({ service: z.string() }).strict()`, connect it to a client over the SDK's in-memory transport, and call the tool with `{ service: "x" }` and with `{ service: "x", extra: 1 }`. Record in the task notes whether the second call is rejected before the handler runs. If it is not, record that tasks 6, 8, 18, 19 and 20 must reject unknown keys inside the handler. Delete the scratch file.
  - Lint probes (no file kept). Each must report the named rule: `printf 'import net from "node:net";\nexport const x = net;\n' | npx eslint --stdin --stdin-filename mcp/src/probe.ts` (`no-restricted-imports`); the same with `export const r = fetch("x");` (`no-restricted-globals`), `console.log(1);` as `shared/src/probe.ts` (`no-console`), `import { Client } from "@modelcontextprotocol/sdk/client/index.js";` as `mcp/src/probe.ts`, `import { execFileSync } from "node:child_process";` as `mcp/src/probe.ts`, and `import { createServer } from "node:http";` as `backend/src/routes.ts`. The `node:child_process` import passes as `scripts/sync-core.ts` and as `mcp/src/bundle.test.ts`, and the `node:http` import passes as `backend/src/server.ts`. Paste the rule names seen into the task notes.
  - Tests: `npx vitest run --passWithNoTests`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none.
  - _Requirements: 2.6, 13.1, 13.5, 15.1, 15.4, 15.5_

- [ ] 2. `scripts/sync-core.ts` and the first vendored Core (`scripts/sync-core.ts`, `scripts/sync-core.test.ts`, `vendor/zombills-core/`)
  - Create `sync-core.ts` as in design "`scripts/sync-core.ts`", steps 1 to 7. Export `syncCore({ repoRoot, zombillsPath, today })` for the test, and run it from a main guard (`import.meta.url === pathToFileURL(process.argv[1]).href`) with `repoRoot = fileURLToPath(new URL("..", import.meta.url))`, `zombillsPath = resolve(repoRoot, process.argv[2] ?? "../Kiroween-Hackathon")` and today's local date. On failure it writes one clear line to stderr (`Not a Zombills repo: …`, `papaparse differs: Zombills core has X, this repo has Y`, `Core build failed`) and exits 1, leaving `vendor/zombills-core/` unchanged (Req 2.4). Use `execFileSync` with argument arrays, never a shell string. Copy with `fs.cp(…, { recursive: true, dereference: true, filter })`, skipping `*.test.*`, `*.property.test.*` and `*.map`; never create a symlink (Req 2.5). `SOURCE` is two lines and a final newline: the hash (with `-dirty` when `git status --porcelain -- packages/core` prints anything), then the date `yyyy-mm-dd`.
  - Tests `sync-core.test.ts` (no network and no real Zombills repo, Req 15.4): build a fake Zombills tree in a temp folder (`git init`; a root `package.json` with `workspaces: ["packages/*"]`; `packages/core/package.json` named `@zombills/core` with `dependencies.papaparse` `5.7.1` and a `build` script that writes `dist/index.js`, `dist/index.test.js`, `dist/a.property.test.js` and `dist/index.js.map`; commit with `git -c user.name=t -c user.email=t@t commit`), and a fake repo root with a `package.json` (`devDependencies.papaparse` `5.7.1`) and an old `vendor/zombills-core/` holding one marker file. Cases: a good sync copies `dist/index.js` and `package.json`, drops the test and map files, creates only real files (no `lstat` reports a symlink) and writes a `SOURCE` matching `/^[0-9a-f]{40}\n\d{4}-\d{2}-\d{2}\n$/`; an uncommitted change under `packages/core` adds `-dirty`; a path without `packages/core/package.json`, a core with another name, a papaparse mismatch (`5.7.0`) and a failing `build` script each fail with the right message and leave the old vendor folder byte for byte unchanged. One more case reads the real repo: `vendor/zombills-core/SOURCE` matches `/^[0-9a-f]{40}(-dirty)?\n\d{4}-\d{2}-\d{2}\n?$/` (Req 2.7).
  - Run the real sync, `node scripts/sync-core.ts` (local disk only, Req 2.5). Then add `"@zombills/core": "file:./vendor/zombills-core"` to `devDependencies` and run `npm install --no-audit --no-fund` (this task may; it adds no registry package). Check that `node --input-type=module -e 'const m = await import("@zombills/core"); console.log(typeof m.parseStatement, typeof m.normalizeTransactions, typeof m.detectSubscriptions, typeof m.classifySubscriptions, typeof m.getCancelHelp, typeof m.cancellationEmail, typeof m.mailtoHref)'` prints `function` seven times; if not, stop.
  - Tests: `npx vitest run scripts/sync-core.test.ts`.
  - Existing tests: none change.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 15.4_

- [ ] 3. Build script, stub entries and the freshness test (`scripts/build.ts`, `scripts/build-fresh.test.ts`, `app.json`, `mcp/src/server.ts`, `mcp/src/core-source.ts`, `backend/src/server.ts`, `ui/src/index.tsx`)
  - Create a minimal `app.json` with only `name: "zombills-reaper"`, `version: "0.1.0"`, `displayName: "The Reaper"` and the `description` of design "Manifest". Task 5 completes it; `build.ts` reads its `version`.
  - Create `build.ts` as in design "`scripts/build.ts`": `export async function build({ outDir = "." } = {})` makes three esbuild calls with exactly the shared options and the per-bundle options of the design table (`__CORE_SOURCE__` from line 1 of `vendor/zombills-core/SOURCE`, `__APP_VERSION__` from `app.json`, the `createRequire` banner on the MCP bundle, the page's externals and classic JSX). A main guard runs `build()`. No timestamp or random value goes into a bundle.
  - Stub entries. `mcp/src/core-source.ts` exports `CORE_SOURCE` and `APP_VERSION` from the two `declare const` defines. `mcp/src/server.ts` creates `new McpServer({ name: "zombills-reaper", version: APP_VERSION })` with no tools yet and connects a `StdioServerTransport`. `backend/src/server.ts` (a stub, replaced in task 24) reads `PORT`, listens on `127.0.0.1`, answers `GET /api/health` with `200 {"ok":true}` and `GET /api/graveyard` with `200 {"ok":true,"historyBytes":n}`, where `n` is the byte length of `<cwd>/data/history.json` or `null` when it is missing, and `404` otherwise. It never returns file content (design step 1). `ui/src/index.tsx` exports `function mount()` returning `<p>Reading the graveyard…</p>`, and the same function as default, with `import { createElement as h } from "react"` (design "Entry").
  - Run `npm run build`. The bundles appear at `mcp/dist/server.js`, `backend/dist/server.js` and `ui/dist/index.mjs`.
  - Tests `build-fresh.test.ts` (design "Freshness test"): `build({ outDir: <mkdtemp> })`, then `Buffer.equals` against each file on disk, failing with "Run npm run build and commit the bundles" and the first differing line number; a second build into another temp folder is byte-equal to the first (determinism, Req 2.8); the root `package.json` has no `dependencies` or an empty object (Req 2.6); the MCP bundle text contains line 1 of `SOURCE` (Req 2.8).
  - Tests: `npx vitest run scripts/build-fresh.test.ts scripts/sync-core.test.ts`.
  - Existing tests: none change.
  - _Requirements: 1.4, 2.6, 2.8, 2.9_

> **Batch 1 done:** reviewer runs `npm test`, `npm run typecheck` and `npm run lint`, all green; `vendor/zombills-core/` holds real files and a `SOURCE`; the three stub bundles exist and match a fresh build; `package.json` has no `dependencies` and no lifecycle script; `git status` shows no `data/` and no `node_modules/` entry.

---

## Batch 2: walking skeleton (design steps 2a, 2b and 3)

The skeleton runs the whole path once: manifest, agent, skill, a minimal `scan_statements` and `bury`, a local install, a cron trigger and Telegram. Task 4 pulls `ref`, Display names, Money text and local dates forward from design step 4, because the skeleton's tool results must already carry `ref` instead of keys (Req 5.8 amended) and capped names (Req 4.6). The skeleton's scan and bury code is interim: tasks 12, 17 and 18 replace it. Its History is already in the final `version: 1` shape (design step 2a), so task 12 reads it as is.

- [ ] 4. Shared basics (`shared/src/types.ts`, `ref.ts`, `display-name.ts`, `money.ts`, `local-date.ts`)
  - Create `types.ts` with every type of design "Types" exactly (`ReaperLabel`, `Settings`, `TrackedCharge`, `Tombstone` with `merchantKey`, `YearlyTotals`, `ScanRecord`, `History`, `ToolResult<T>`, `Reason` including `"internal-error"`, `SkipKind`, `UndeadEntry`, `PossessedEntry`, `TrialTrapEntry`, `RisenEntry`, `TombstoneView`, `ScanSummary`, `Candidate`, `CancelDraft`, `GraveyardMonth`, `GraveyardView`, `GraveyardResponse`). `Cadence` is imported as a type from `@zombills/core`. Every entry type has `ref`, never `key`.
  - `ref.ts`: `refOf(key) = createHash("sha256").update(key, "utf8").digest("hex").slice(0, 12)`.
  - `display-name.ts`: `displayName(text)` and `foldName(text)` as in design "Shared helpers" (NFC, trim, collapse `\s+`; cap at 80 code points as 79 plus `…`; `foldName` adds `toLowerCase()`).
  - `money.ts`: `CADENCE_FACTOR = { weekly: 52, monthly: 12, yearly: 1 }` and `moneyText(cents, currency)` with `Intl.NumberFormat("en-US", { style: "currency", currency })`. This is the only file that divides by 100.
  - `local-date.ts`: `localDate(date, timeZone)` (`Intl.DateTimeFormat("en-CA", …)` → `yyyy-mm-dd`) and `localMonth(iso, timeZone)` (its first 7 characters).
  - Unit tests `ref.test.ts`: `refOf("netflix")` equals the literal from `printf %s netflix | shasum -a 256 | cut -c1-12`, pasted into the test; the result is 12 lowercase hex characters; two keys that differ in one character give different refs.
  - Unit tests `money.test.ts`: `moneyText(1799, "USD")` is `$17.99`, `moneyText(499, "GBP")` is `£4.99`, `moneyText(118140, "USD")` is `$1,181.40`, `moneyText(0, "EUR")` is `€0.00`; `CADENCE_FACTOR` values.
  - Unit tests `local-date.test.ts`: `2026-12-01T00:30:00Z` is `2026-11-30` in `America/Los_Angeles` and `2026-12-01` in `Europe/London`; `localMonth` of the same instant in both zones; `UTC`.
  - Property tests `display-name.property.test.ts` (**P12**, ≥200 runs, strings from `fc.string({ unit: "grapheme" })` and `fc.string({ unit: "binary" })`, mixed with runs of white space and strings longer than 80 code points): output never longer than 80 code points (`[...s].length`); `displayName(displayName(x)) === displayName(x)`; `foldName(displayName(x))` equals `foldName(x)` when `x` has at most 80 code points after collapsing. Fixed cases in the same file: exactly 80 code points kept whole; 81 cut to 79 plus `…`; a surrogate pair at position 79 is not split; `"  Net\t\nflix  "` gives `Net flix`; `foldName("NETFLIX ")` is `netflix`.
  - Tests: `npx vitest run shared/src`.
  - Existing tests: none change.
  - _Requirements: 4.6, 5.7, 5.8, 6.2, 7.9, 15.2_

- [ ] 5. Manifest, agent and skill skeleton (`app.json`, `agents/reaper.json`, `skills/reaper/SKILL.md`, `app-manifest.test.ts`)
  - Complete `app.json` exactly as design "Manifest" (`permissions` with `cron`, `mcpTools: ["send_message"]` and `api: ["/apps/zombills-reaper/api"]`; `agents`, `skills`, the `/bin/sh -c "exec node \"$HOME/…\""` server with no `env` and no `autoApprove`; the cron; the backend; `ui`; `setup.configSchema`). `version` stays `0.1.0`. No `setup.onInstall`.
  - Create `agents/reaper.json` as design "Agent": `name`, `description`, `tools: ["@kirocrew-core", "@zombills-reaper:reaper"]`, `allowedTools: ["@zombills-reaper:reaper"]`, no `model`, and `prompt` as one string built from the five points of the design's prompt outline, in that order and with their wording.
  - Create `skills/reaper/SKILL.md` with the front-matter of design "Skill" exactly (`triggers` a comma-separated string, `always: false`) and three sections: 1 "Rules" (the agent prompt's prohibition repeated word for word, the vocabulary and the tone rules), 2 "Monthly round" (call `scan_statements`; `not-configured` or `folder-missing` → Delivery message D2, then reply the same text; `ok` and `firstScan` → the first-count message of design "Skill" section 3, sent as D1 and replied; otherwise reply "All quiet in the graveyard this month."), and 4 "Delivery" (D1 and D2 with `send_message` and `session: "telegram"`, at most one message per round, no retry). Sections 3 and 5 to 8 are added in task 21.
  - Unit tests `app-manifest.test.ts`: `name`, `version` (semver, `0.1.0`), `displayName`, a one-sentence `description` (Req 1.1); the `mcpServers` object deep-equals the design object (Req 1.2); `agents`, `skills`, `backend` and `ui` deep-equal the design (Req 1.3, 12.1); `setup.onInstall` absent (Req 1.4); `setup.configSchema` has one required string property `statementsFolder` whose `description` says it is read in place and is set through the Reaper agent or `data/settings.json` (Req 1.5); `permissions` deep-equals the exact design object (Req 1.6); `JSON.stringify(app)` has no `/Users/`, no `${HOME}` and nothing matching `/\d{6,}:[A-Za-z0-9_-]{30,}/` (Req 1.7); the one cron deep-equals `{ name: "monthly-scan", cron_expr: "0 9 1 * *", agent: "reaper", message: "Run the monthly round of the reaper skill.", silent: true, strict_schedule: true, persistent_session: false, enabled: true }` with no `timezone`, and its `message` holds no `/`, digit or `$` (Req 10.1, 10.2, 10.4); the agent file has `tools` exactly the two values, `allowedTools` either `["@zombills-reaper:reaper"]` or `["@zombills-reaper:reaper", "@kirocrew-core/send_message"]`, and no `model` (Req 8.1, 8.4); every file the manifest names is committed (rules header): `agents/reaper.json`, `skills/reaper/SKILL.md`, `ui/dist/index.mjs`, `backend/dist/server.js`, and the MCP script found as the quoted path after `exec node` in the `-c` string with `$HOME/.kiro/crew/apps/zombills-reaper/` replaced by the repo root (Req 1.8); the root `package.json` has no `dependencies` (or an empty object) and none of the lifecycle scripts of task 1; `package-lock.json` is committed; `git ls-files --cached -- data` is empty (design "Manifest", review-design-1 #4, #15). The prompt and skill-text checks come in task 21.
  - Tests: `npx vitest run app-manifest.test.ts scripts/build-fresh.test.ts`.
  - Existing tests: none change.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.6, 8.1, 8.4, 9.1, 9.11, 10.1, 10.2, 10.4, 12.1_

- [ ] 6. Minimal MCP server, `scan_statements` skeleton and round-1 demo files (`mcp/src/server.ts`, `tools.ts`, `app-paths.ts`, `log.ts`, `scan-statements.ts`, `test-mcp-client.ts`, `mcp/fixtures/demo/round-1/`)
  - `app-paths.ts`: `appRootFromModule(url) = resolve(dirname(fileURLToPath(url)), "../..")` and `dataDirOf(appRoot) = join(appRoot, "data")` (design "Design decisions").
  - `log.ts`: `logCounts(event, counts)` writes one line to stderr, `reaper: <event> k=v …`; `event` is one of `scan`, `bury`, `unbury`, `set-folder`, `tool-error`, `lock-takeover`, and its type accepts only `Record<string, number | Reason | string-literal error names | null>` as design "Privacy enforcement" says.
  - `tools.ts`: `createReaperTools({ dataDir, appRoot, now, timeZone, coreSource })` returns a map of tool name → `{ description, inputSchema, handler }`. The wrapper catches any throw, logs `logCounts("tool-error", { tool, name: err.name, code: err.code ?? null })` and returns `{ ok: false, reason: "internal-error" }`.
  - `server.ts`: as design "Wiring". Register each tool with `server.registerTool(name, { description, inputSchema }, handler)`; each result is `{ content: [{ type: "text", text: JSON.stringify(result) }], isError: false }`, no `structuredContent`. This task registers only `scan_statements` (input `z.object({}).strict()`, the design's description text).
  - `scan-statements.ts`, skeleton (replaced in task 17): read `data/settings.json`; anything but a plain object with `version === 1` and a non-empty string `statementsFolder` → `not-configured`; a missing folder → `folder-missing`. List regular files directly in the folder whose name matches `/\.csv$/i` and does not start with `.`, in code-unit order, at most 120. For each, read the bytes, strip a UTF-8 BOM, decode as UTF-8, run `parseStatement`; a `mapped` result goes through `normalizeTransactions`, any other result is counted in `files.skipped` (`unknown-columns`, `empty` or `parse-error`). No file read → `no-statements`. Concatenate the transactions, run `detectSubscriptions` (no `asOf`) and `classifySubscriptions(active, new Map())`. Return a `ScanSummary` with `firstScan: true`, `folderName = basename(folder)`, empty `newUndead`, `possessed`, `trialTraps` and `risenAfterBurial`, `undead` built as design "Scan algorithm" step 10 ("Undead entry", `ref = refOf(s.id)`, `name = displayName(s.merchant)`, sorted by `yearlyCostCents` descending, then `name`, then id), `yearlyTotals` as step 10, `historyReset: false`, `historyDropped: 0`. Write the interim History in the final shape: `version: 1`, `coreSource`, `trackedCharges` rebuilt from the active subscriptions (fields as Glossary "Tracked charge", `firstSeenScan = lastSeenScan = scanId`, `reportedRiseDate = s.priceRise?.latestRise?.date ?? null`), `tombstones` kept from the existing file when it is a JSON object with a `tombstones` array (else `[]`), `scans` = the existing array plus one new Scan record, `reportedTrials: []`. Write it to `history.json.tmp-<pid>` with mode 0600 and rename it over `history.json`, after `mkdir(dataDir, { recursive: true, mode: 0o700 })`. `scanId` as design ("`scan-<yyyymmddThhmmssZ>-<6 hex>`"). Log one `logCounts("scan", …)` line with counts only.
  - Round-1 demo files, `mcp/fixtures/demo/round-1/2026-01.csv` to `2026-06.csv`, as design "Demo statements": header `Date,Description,Amount`, ISO dates, charges positive and a monthly salary credit (`PAYROLL DEPOSIT`) negative. Each month: `NETFLIX.COM` 15.49 on the 2nd, `SPOTIFY USA` 11.99 on the 5th, `DROPBOX*PLUS` 11.99 on the 9th, `PLANET FITNESS CLUB` 24.99 on the 12th, `OPENAI *CHATGPT SUBSCR` 20.00 on the 15th, `GOOGLE *YOUTUBEPREMIUM` 13.99 on the 20th, the salary on the 25th, and three one-off purchases (groceries, coffee, fuel; generic shop names with no person or address) whose amounts differ from every recurring amount and yearly cost, the last on the 28th. Fake data only.
  - `test-mcp-client.ts` (test helper): spawn `node <script>` with a given `cwd` and `env`, send newline-delimited JSON-RPC (`initialize`, `notifications/initialized`, `tools/list`, `tools/call`) on stdin and read framed replies from stdout, collect stderr, and close the process. It writes raw JSON-RPC and imports no SDK client (the lint rule bans other SDK subpaths).
  - Unit tests `scan-statements.test.ts` (skeleton cases; task 17 extends the file): with a temp Data dir and `createReaperTools`, a missing Settings file gives `not-configured`; a Settings file naming a missing folder gives `folder-missing`; scanning a temp copy of `round-1/` gives `ok`, `firstScan: true`, 6 `undead` entries and `yearlyTotals.USD` `{ yearlyCostCents: 118140, guessedCount: 0 }`; no entry has a `key`, `merchantKey` or `id` field; the written `history.json` has `version: 1`, 6 Tracked charges, one Scan record and mode 0600. If Core finds a different count, adjust only the one-off rows or the description text in the CSVs (never the recurring amounts) and note it.
  - Bundle test `mcp/src/bundle.test.ts` (design "Bundle start tests"): copy `app.json`, `agents/` and `mcp/dist/server.js` into `<tmp>/zombills-reaper/` (no `node_modules`), spawn the bundle with `env: { PATH: process.env.PATH }`, and check that `tools/list` names exactly `["scan_statements"]` (sorted) and that `scan_statements` returns `not-configured`, which proves it looked in `<tmp>/zombills-reaper/data`. Tasks 8, 18, 19 and 20 add tool names.
  - Run `npm run build`.
  - Tests: `npx vitest run mcp/src app-manifest.test.ts scripts/build-fresh.test.ts`.
  - Existing tests: none change.
  - _Requirements: 1.4, 2.10, 4.1, 5.1, 5.7, 5.8, 13.1, 14.4_

- [ ] 7. (Claude Code) Install, enable and trigger; Telegram tests T1, T2, T3, T7, T8
  - Needs tasks 1 to 6 ticked and the bundles built. Kiro tasks do not wait for this task.
  - Check that `<repo>/data` does not exist (move it out of the repo if it does; review-design-1 #15). Run `kirocrew app install /Users/zax/Projects/zombills-reaper`, then enable the app in the dashboard (Apps → Library → The Reaper → Enable). Do not set `agent.apps_allow_third_party`.
  - Make a demo folder outside the repo (for example `~/Documents/ReaperDemo`), copy `mcp/fixtures/demo/round-1/*.csv` into it, and write `~/.kiro/crew/apps/zombills-reaper/data/settings.json` by hand with mode 0600. `kirocrew cron list` → the id of `zombills-reaper/monthly-scan` → `kirocrew cron trigger <id>`.
  - Skeleton checks (design step 2b): `gateway.log` shows "Installing npm deps" for the App root with exit code 0 and the backend healthy afterwards; the skill loads for the cron message; the MCP server started from the per-run cwd and wrote `data/history.json`; the backend stub's `/apps/zombills-reaper/api/graveyard`, called through the gateway proxy as in spike Q8c, returns a non-null `historyBytes` (sandbox tier, `sandbox_tiers.py:232`).
  - Telegram tests T1, T2, T3, T7 and T8 exactly as the design "Telegram test" table. For T3, ask the Reaper agent in the dashboard chat to send the fixed sample alert of design "Demo statements" and a sample bury draft with a `mailto:` link and a code block, plus one 1,500-character message.
  - Append a "Skeleton checks" and a "Telegram" section to `spike-2026-11-17.md`, one row per check with pass or fail and the evidence (log line, file, message). For each failure, name the fallback of design "Telegram isolation" that applies. Do not edit code; tasks 21 and 28 apply the fallbacks.
  - _Requirements: 1.2, 1.4, 8.3, 9.2, 10.1, 10.3, 11.2_

- [ ] 8. Minimal `bury` and the cancel draft (`mcp/src/cancel-draft.ts`, `mcp/src/bury.ts`, `mcp/src/server.ts`)
  - `cancel-draft.ts`: `cancelDraft(t)` exactly as design "Cancel draft": `getCancelHelp(t.serviceId, t.currency)`; a link gives `{ kind: "link", url, host, steps, appStoreMayApply }`; otherwise `cancellationEmail({ serviceName: t.name, amountText: moneyText(…), currency, cadence, cadenceAssumed })` and `mailtoHref`. Only the one entry is looked up; the cancel data is never listed.
  - `bury.ts`, skeleton (replaced in task 18): read and `JSON.parse` `history.json`; no file or no Scan record → `no-scan`. Current charges = Tracked charges whose `lastSeenScan` is the last Scan record's `scanId`. Resolve `service` by `foldName` equality with `serviceId`, then with `merchant`. One hit: if a Tombstone has the same `key`, return `{ ok: true, tombstone, cancel, alreadyBuried: true }` and write nothing; else add the Tombstone of design "`bury`" step 2 (`yearlySavingCents = cadenceAssumed ? null : amountCents × CADENCE_FACTOR[cadence]`, `buriedAt = localDate(now, timeZone)`, `merchantKey`, `risenReportedThrough: null`), write the file the same way as task 6, and return `alreadyBuried: false`. `tombstone` is a `TombstoneView` (no `key`, no `merchantKey`, with `ref`). No hit → `not-found` with `candidates: []`; several → `ambiguous` with candidates `{ name, amountText, cadence }`. The Statements folder is never read (Req 6.9).
  - Register `bury` in `tools.ts` and `server.ts` with input `z.object({ service: z.string().min(1).max(400) }).strict()` and the design's description.
  - Unit tests `cancel-draft.test.ts`, with real Core data: a Netflix Tombstone (`serviceId` `netflix`, USD) gives `kind: "link"` with a non-empty `url` and `host`; a Planet Fitness Tombstone gives `kind: "email"` whose `mailto` starts with `mailto:` and whose body contains `$24.99`; a Tombstone with `serviceId: null` gives an email.
  - Unit tests `bury.test.ts` (skeleton cases; task 18 extends the file): a fresh Data dir gives `no-scan`; after a scan of `round-1/`, `bury Netflix` gives `ok`, a link, `alreadyBuried: false` and `tombstone.yearlySavingCents` 18588 with no `key` or `merchantKey`; a second `bury netflix` gives `alreadyBuried: true` and leaves `history.json` byte-equal; `bury Planet Fitness` gives an email; `bury Hulu` gives `not-found`; after the statements folder is renamed away, `bury Spotify` still succeeds (the folder is not read). If Core gives no `serviceId` for Netflix or Planet Fitness from the round-1 descriptions, adjust only the description text in the six CSVs and note it.
  - In `bundle.test.ts`, the expected tool names become `["bury", "scan_statements"]`.
  - Run `npm run build`.
  - Tests: `npx vitest run mcp/src scripts/build-fresh.test.ts`.
  - Existing tests: `mcp/src/bundle.test.ts` (expected tool names only).
  - _Requirements: 6.2, 6.3, 6.5, 6.9_

- [ ] 9. (Claude Code) "Bury" from Telegram; Telegram tests T4, T5, T6; pick the fallbacks
  - Needs task 8 ticked and the bundles built. Kiro tasks do not wait for this task.
  - `kirocrew app update zombills-reaper`. In the bot chat, `/agent reaper`; then T4, T5 and T6 exactly as the design "Telegram test" table, on the round-1 demo folder.
  - Add T4 to T6 to the "Telegram" section of `spike-2026-11-17.md`. End the section with a "Fallbacks chosen" list naming, for each of the four places of design "Telegram isolation", either "design default" or the fallback row taken (for example `allowedTools` gains `"@kirocrew-core/send_message"`; the alert's last line names the dashboard chat), and the real tool surface from T8 for the README (Req 8.3). Do not edit code.
  - _Requirements: 8.3, 9.2, 9.7, 14.1_

> **Batch 2 done:** reviewer runs `npm test`, `npm run typecheck` and `npm run lint`, all green; the MCP bundle starts from a temp App root with no `node_modules` and lists `bury` and `scan_statements`; no tool result in the tests has a `key`, `merchantKey` or `id`. The Claude Code tasks 7 and 9 may still be open; they do not block batch 3.

---

## Batch 3: codecs, data files, History store and lock (design steps 4 and 5)

Pure codecs first, then the file layer, then the lock. Task 12 moves the skeleton's scan and bury onto the store and the lock, so the two-process test runs against the real bundle.

- [ ] 10. History and Settings codecs (`shared/src/history-codec.ts`, `shared/src/settings-codec.ts`, `mcp/fixtures/generators.ts`)
  - `history-codec.ts`: `HistoryDecode`, `decodeHistory`, `encodeHistory`, `emptyHistory` and `LIMITS` exactly as design "Codec", steps 1 to 7. Records are copied field by field into fresh object literals; no record is spread or `Object.assign`ed from parsed JSON. `decodeHistory` never throws (Req 7.10). Dates are real calendar dates (`2026-02-30` fails). `yearlySavingCents` must be `null` when `cadenceAssumed`, else `amountCents × CADENCE_FACTOR[cadence]`. Limits are applied after the checks, and records cut by limits are not counted in `dropped`.
  - `settings-codec.ts`: `decodeSettings(text)` returns `{ kind: "ok", settings }` only for a plain object with `version === 1` and a non-empty string `statementsFolder`, else `{ kind: "not-configured" }`; extra keys are ignored. `encodeSettings(settings)` writes only `version` and `statementsFolder`, as `JSON.stringify(…) + "\n"`.
  - `mcp/fixtures/generators.ts` (first part; task 14 adds the statement arbitraries): `validHistoryArb` (a History that passes every check, with merchants and names of 1 to 80 code points, including exactly 80, and Display names cut from longer text by `displayName`; unique keys and scan ids; savings consistent with cadence; at most the limits), `rawRecordArb` (records with one field broken: wrong type, negative or fractional cents, `2026-13-01`, unknown cadence, `usd`, an 81-code-point name, inconsistent saving) and `jsonTextArb` (`fc.json()`, `fc.string()`, and JSON objects with `__proto__`, `constructor` and `prototype` keys).
  - Unit tests `history-codec.test.ts`: every `unreadable` kind of Req 7.3 (not JSON, an array, `null`, a string, missing `version`, `version` 0, `1.5`, `"1"`, a non-array `scans`, a `coreSource` of 65 characters); `version: 2` gives `{ kind: "newer", version: 2 }`; each record check of step 5 drops exactly that record and counts it; duplicate Tracked-charge keys, Tombstone keys, scan ids and `reportedTrials` entries are dropped and counted; limits keep the 36 newest scans, the 1,000 Tracked charges with the newest `lastSeenScan` (an unknown `lastSeenScan` ranks oldest, ties in array order) and the 1,000 newest Tombstones by `buriedAt`, with `dropped` unchanged (Req 7.7); `emptyHistory()` round-trips.
  - Unit tests `settings-codec.test.ts`: ok case; missing `statementsFolder`, empty string, `version: 2`, an array, not JSON → `not-configured`; extra keys dropped by `encodeSettings`.
  - Property tests `history-codec.property.test.ts` (≥200 runs): **P9** `decodeHistory(encodeHistory(h))` deep-equals `{ kind: "ok", history: h, dropped: 0 }` for every `validHistoryArb` value (Req 7.9); `decodeHistory(s)` never throws and returns `ok`, `unreadable` or `newer` for every `jsonTextArb` value (Req 7.10); after decoding text with a `__proto__` key, `({} as Record<string, unknown>).polluted` is `undefined` and every decoded record's prototype is `Object.prototype`; a valid History with one `rawRecordArb` record inserted decodes with `dropped === 1` and the rest unchanged (Req 7.4).
  - Tests: `npx vitest run shared/src`.
  - Existing tests: none change.
  - _Requirements: 3.4, 7.1, 7.3, 7.4, 7.5, 7.7, 7.9, 7.10, 15.2, 16.9_

- [ ] 11. Data files and the History store (`mcp/src/data-files.ts`, `mcp/src/history-store.ts`)
  - `data-files.ts`: `ensureDataDir`, `writeFileAtomic`, `rotateKeep3` and the UTC stamp helper with `-2`, `-3`… on a clash, exactly as design "Atomic write and modes". The temp name is `<name>.tmp-<pid>-<6 hex>`, opened with `wx` and mode 0600; `fsync` the file, rename, then `fsync` the directory (best effort). On error the temp file is unlinked and the error rethrown.
  - `history-store.ts`: `loadHistoryForWrite(dataDir, now)` with the six rows of design "Load for write" (missing; ok; ok with drops → `history.backup-<stamp>.json` with mode 0600 and `rotateKeep3("history.backup")`; unreadable → rename to `history.unreadable-<stamp>.json` and `rotateKeep3("history.unreadable")`; newer → `{ error: "history-newer" }`, file untouched; other read error → `{ error: "history-unreadable" }`). `readHistory(dataDir)` with no side effects. `saveHistory(dataDir, history)` = `writeFileAtomic(dataDir, "history.json", encodeHistory(history))`.
  - Unit tests `data-files.test.ts` (temp dirs): the target holds the new text and mode 0600 (`stat.mode & 0o777`); no `*.tmp-*` file is left after a success or after a forced failure (write into a directory that is made read-only, or a target name that is a directory); `ensureDataDir` creates mode 0700 and leaves an existing directory's mode alone; `rotateKeep3` keeps the 3 newest of 5 stamped files and touches other names; a stamp clash in one second gives `-2`.
  - Unit tests `history-store.test.ts`: each of the six rows, with the files present afterwards and their modes; `history-newer` leaves the bytes and the name unchanged (Req 7.5); `readHistory` on an unreadable file returns `history-unreadable` and renames nothing; the original bytes of a file with a bad record are in the backup.
  - Tests: `npx vitest run mcp/src/data-files.test.ts mcp/src/history-store.test.ts shared/src`.
  - Existing tests: none change.
  - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.8_

- [ ] 12. Lock, skeleton tools on the store, and the two-process test (`mcp/src/history-lock.ts`, `mcp/src/scan-statements.ts`, `mcp/src/bury.ts`, `mcp/src/history-lock.two-process.test.ts`)
  - `history-lock.ts`: `LOCK_TIMINGS`, `LockClock`, `REAL_CLOCK` and `withHistoryLock(dataDir, fn, timings, clock)` exactly as design "Lock", steps 1 to 5. All waiting and age checks go through `clock`. A takeover logs `logCounts("lock-takeover", { count: 1 })`. The lock file is unlinked in `finally`; `ENOENT` there is ignored.
  - Move the skeleton tools onto the store, without changing what they report: in `scan-statements.ts`, settings come from `decodeSettings`, and the History read-modify-write runs inside `withHistoryLock` with `loadHistoryForWrite`, then `saveHistory`; `history-newer`, a read error and `history-busy` return `{ ok: false, reason }` with nothing written; a reset or drop sets `historyReset` / `historyDropped`. In `bury.ts`, the same for its load and write, and `historyReset` / `historyDropped` beside `ok` when its own load reset or dropped (Req 7.3 amended). Reading and parsing statements stays outside the lock (design "Lock scope").
  - Unit tests `history-lock.test.ts`, with a fake `LockClock` (no real timers; mtimes set with `fs.utimes`): a free lock runs `fn` once and leaves no lock file; a held fresh lock gives `history-busy` after `waitMs` without calling `fn`, and the fake clock saw `waitMs / pollMs` sleeps; a lock older than `staleMs` is taken over; a lock naming a dead pid (spawn and wait for a short `node -e ""` child, then use its pid) is taken over at once; an unparsable fresh lock is judged by mtime only; a throwing `fn` still unlinks the lock and rethrows; the lock file has mode 0600.
  - Two-process test `history-lock.two-process.test.ts` (design "Unit tests", Req 7.6): copy `app.json`, `agents/` and `mcp/dist/server.js` into a temp App root, write `data/settings.json` naming a temp copy of `round-1/`, and run one scan. Start two bundle processes with `test-mcp-client.ts`. For each of the six round-1 services, send `scan_statements` to one process and `bury <service>` to the other at the same moment. Afterwards `history.json` decodes with 7 Scan records and 6 Tombstones, and no `history.lock` is left. Repeat the whole run 3 times with fresh temp folders. A `history-busy` result fails the test (5 s is far above one write).
  - Existing tests: `mcp/src/scan-statements.test.ts` and `mcp/src/bury.test.ts` pass unchanged; this task only adds cases to them for `history-newer` (scan and bury return it and leave the file byte-equal) and for `history-busy` (a held fresh lock with a fake clock).
  - Run `npm run build`.
  - Tests: `npx vitest run mcp/src shared/src scripts/build-fresh.test.ts`.
  - _Requirements: 5.9, 7.3, 7.5, 7.6, 7.8_

> **Batch 3 done:** reviewer runs `npm test`, `npm run typecheck` and `npm run lint`, all green; P9 passes; the two-process test passes 3 runs in a row; no lock test uses a real timer.

---

## Batch 4: reading, merging, matching and the full scan (design steps 6, 7 and 8)

Task 13 reads files, task 14 merges them, task 15 matches, task 16 is the pure diff and task 17 joins them into the real `scan_statements`. Trial traps and risen-after-burial (Req 5.5, 5.6) are Should items; if they are dropped, only their parts of tasks 16 and 17 go.

- [ ] 13. Statement files, decoding and per-file reading (`mcp/src/statement-files.ts`, `mcp/src/decode-bytes.ts`, `mcp/src/read-statements.ts`)
  - `statement-files.ts`: `listStatementFiles(folder)` and `readStatementFile(folder, name)` as design "Scan algorithm" steps 3 and 4: `readdir` with `withFileTypes`; a Statement file is a `Dirent` with `isFile()`, a name matching `/\.csv$/i` and not starting with `.`; code-unit order; the first 120 are read and the rest counted as `too-many`. Reading uses `open(path, O_RDONLY | O_NOFOLLOW)`, `fstat`, `too-large` above 5 MiB (not read), any error → `unreadable`, and closes in `finally`. Nothing in the folder is written, renamed or touched.
  - `decode-bytes.ts`: `decodeStatementBytes(bytes)` as step 5: strip `EF BB BF`, `TextDecoder("utf-8", { fatal: true })`, else `TextDecoder("windows-1252")`.
  - `read-statements.ts`: `readAll(folder)` → `{ perFile: NormalizedTransaction[][], files: { read, skipped }, rowErrorCount }` with the Core outcome mapping of step 5 (`mapping-required` → `unknown-columns`; `EMPTY_CSV_REASON` or `NO_CONTENT_ROWS_REASON` → `empty`; other errors → `parse-error`; an assumed `dd/mm/yyyy` or `mm/dd/yyyy` format → `ambiguous-dates`; `mapped` with no transactions → `empty`). Only `rowErrors.length` is kept; no row, description or `rawRow` leaves the function except inside the normalised transactions (Req 4.6).
  - Unit tests `statement-files.test.ts` (temp folders): a symlink to a CSV and a sub-folder named `x.csv` are not Statement files; `.hidden.csv` is skipped; `A.CSV` is read; 121 files read 120 and count 1 `too-many`, and the 121st by code-unit order is the one left; a 5 MiB + 1 byte file is `too-large` and a 5 MiB file is read; a `chmod 000` file is `unreadable` (skipped when running as root); names, sizes and mtimes in the folder are unchanged afterwards (Req 4.1).
  - Unit tests `decode-bytes.test.ts`: UTF-8 with and without a BOM; `0xE9` alone decodes as `é` through Windows-1252; `0x80` decodes as `€`.
  - Unit tests `read-statements.test.ts`: one fixture per skip kind written into a temp folder (a CSV with unknown headers, an empty file, a header-only file, an ambiguous `03/04/2026`-only file, a broken CSV); `round-1/` gives 6 read files and no skips; `rowErrorCount` counts a bad row without exposing it.
  - Tests: `npx vitest run mcp/src/statement-files.test.ts mcp/src/decode-bytes.test.ts mcp/src/read-statements.test.ts`.
  - Existing tests: none change.
  - _Requirements: 4.1, 4.2, 4.3, 4.6_

- [ ] 14. Merging overlap and the statement generators (`mcp/src/merge-transactions.ts`, `mcp/fixtures/generators.ts`)
  - `merge-transactions.ts`: `mergeOverlap(perFile)` exactly as design step 6, first bullet: group each file's transactions by `k = [date, merchant.key, amountCents, currency]`, sort each list by `JSON.stringify`, keep the longest list per `k` (ties: the smallest element by element), concatenate, sort by `JSON.stringify(k)` then by `JSON.stringify` of the transaction. It depends only on the multiset of per-file lists.
  - In `generators.ts`, add the statement arbitraries of design "Correctness properties": a pool of services (Core-known merchants such as `NETFLIX.COM` and `SPOTIFY USA`, unknown merchants, and processor-wrapped ones `PAYPAL *<marker digits> REF <marker digits>`), weekly, monthly and yearly cadences, price steps that are and are not Band rises, trial patterns (free or low first charge then full), one-off noise rows whose description is a unique marker (`ZQ` plus digits) and whose amount differs from every recurring amount and yearly cost, monthly files as CSV text in the round-1 format, shuffles of files and names, and duplicated files. Export `statementSetArb`, `markersOf(set)` and `oneOffAmountsOf(set)`.
  - Property tests `merge-transactions.property.test.ts` (≥200 runs; transactions built by parsing and normalising `statementSetArb` text with Core in memory): **P1** (merge part) every permutation of the per-file lists gives a deeply equal merged list; `[a]` and `[a, a]` merge to the same list (Req 4.8); a key occurring 2 times in one file and 1 time in another is kept 2 times (Req 4.4); the output is sorted as specified.
  - Tests: `npx vitest run mcp/src/merge-transactions.property.test.ts shared/src`.
  - Existing tests: none change (`generators.ts` gains exports only).
  - _Requirements: 4.4, 4.7, 4.8, 16.1, 16.2_

- [ ] 15. Matching (`mcp/src/match.ts`)
  - `matchRecords(subs, records, previousScanId)` → `{ pairs, unmatchedSubs, unmatchedRecords, blocked }` exactly as design step 9: over all subscriptions (active and ended); pass 1 by `s.id === r.key` in `id` order; pass 2 builds the full qualifying relation (same `currency`, `cadence`, `merchantKey`; `s.priceHistory` holds `r.amountCents`; `!s.evidence.cadenceAssumed || r.cadenceAssumed`) and accepts only mutually unique pairs, with no tie-breaker; `blocked` holds the active unmatched subscriptions whose Triple equals the Triple of a blocking unmatched record. A Tracked charge blocks only when its `lastSeenScan === previousScanId`; a Tombstone (no `lastSeenScan`) blocks only when pass 2 found at least one qualifying subscription for it. The function is generic over Tracked charges and Tombstones.
  - Unit tests `match.test.ts`: pass 1 wins over pass 2; a price change keeps the pair through `priceHistory`; two subscriptions qualifying for one record leave all three unmatched and both subscriptions blocked; a Tracked charge last seen two scans ago blocks nothing; an unmatched Tombstone with no qualifying subscription blocks nothing; an ended subscription takes its own record, so a new active series with the same Triple is not blocked (the Netflix re-subscribe case of review-design-1 #2); a guessed-cadence subscription does not qualify for a record with `cadenceAssumed: false`.
  - Property tests `match.property.test.ts` (**P6**, ≥200 runs, arbitraries of subscriptions and records over a small set of Triples so collisions are common): no record is in two pairs and no subscription in two; every pair qualifies or matches by key; a subscription with two qualifying unmatched candidates in pass 2 is not paired, and neither is a record with two; shuffling `subs` or `records` gives the same pairs and `blocked`.
  - Tests: `npx vitest run mcp/src/match.test.ts mcp/src/match.property.test.ts`.
  - Existing tests: none change.
  - _Requirements: 5.3, 5.13, 16.6_

- [ ] 16. Scan diff (`mcp/src/scan-diff.ts`)
  - `diffScan(input)` → `{ summary, nextHistory }`, pure, exactly as design steps 8 to 11. Input: all Core subscriptions, `history`, `coreSource`, `scanId`, `now`, `folderName`, `files`, `statementRange`, `historyReset`, `historyDropped`. It computes `rebaseline` and `firstScan` (step 8), runs `matchRecords` for Tombstones and Tracked charges with the previous Scan record's id, calls `classifySubscriptions(active, answers)` with `"not-using"` for the active subscriptions paired with a Tombstone (Req 6.6), builds the Undead, New undead, Possessed, Trial trap, Risen after burial and Yearly totals of step 10 and the next History of step 11 (including `reportedRiseDate = latestRise?.date ?? null` for every new Tracked charge, review-design-1 #1, and `key`-only updates for ended pairs). `daysBetween` uses `Date.UTC`. Labels drop `"zombie"` and keep the order `possessed`, `trial-trap`. No entry carries a key; `ref = refOf(s.id)`.
  - Unit tests `scan-diff.test.ts`, every case of design "Unit tests" for this file, with subscriptions built by running Core on small CSV texts in memory: first scan (nothing reported, trials and rises recorded); re-baseline on a different `coreSource` (Tracked charges rebuilt, Tombstones kept and re-matched, nothing reported); new undead; possessed reported once and not again after a dip; a new charge already possessed when first seen (new undead now, not possessed on the re-scan); trial trap once; risen after burial at 3 days (not reported) and 4 days (reported, then not again for the same date); blocked subscriptions (not reported, History unchanged for them); the ended buried Netflix plus a new active Netflix (the new one is new undead, the Tombstone stays with the ended one); an ended iCloud and a new Apple Arcade on `APPLE.COM/BILL` (Apple Arcade reported); a Tracked charge missing for two scans blocks nothing; the Scan record contents (`undeadCount`, `yearlyTotals`, `newCount`, `possessedCount`); `increasePerYearCents = (to − from) × CADENCE_FACTOR`.
  - Property tests `scan-diff.property.test.ts` (100 runs, Core on `statementSetArb`): **P5** `yearlyTotals[c].yearlyCostCents` is the sum over that currency's non-guessed `undead`, `guessedCount` the number of guessed ones, and each entry's `yearlyCostCents` equals its Core subscription's; **P11** (Should) applying the update of one scan and then a second scan of the same set gives the same `trackedCharges` (apart from `lastSeenScan`), `tombstones` and `reportedTrials` as one scan.
  - Tests: `npx vitest run mcp/src/scan-diff.test.ts mcp/src/scan-diff.property.test.ts mcp/src/match.test.ts`.
  - Existing tests: none change.
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.12, 5.13, 6.6, 7.11, 16.5, 16.11_

- [ ] 17. Full `scan_statements` (`mcp/src/scan-statements.ts`)
  - Replace the skeleton with the orchestration of design "Scan algorithm" steps 1 to 12: `decodeSettings`; folder `stat` (`ENOENT`, `ENOTDIR`, `EACCES`, `EPERM` or not a directory → `folder-missing`); `readAll`; no file read → `no-statements`; `mergeOverlap`; `detectSubscriptions` (no `asOf`); a null `firstDate` or `lastDate` → `no-statements`; then inside `withHistoryLock`: `loadHistoryForWrite`, `diffScan`, `saveHistory`. Parsed rows go out of scope before the lock is taken. One `logCounts("scan", { read, skipped, rowErrors, undead, new, possessed })` line.
  - Unit tests `scan-statements.test.ts` (task 6 cases kept): `no-statements` for a folder with only a broken CSV; an unreadable `history.json` gives `historyReset: true` and a `history.unreadable-*.json` file; a History with one bad record gives `historyDropped: 1` and a backup; a different `coreSource` re-baselines (`firstScan: true`, Tombstones kept); round 1 then round 1 again reports nothing; `ok: false` leaves `history.json` byte-equal (Req 5.9); a handler made to throw (a Data dir path that is a regular file) gives `internal-error` and a stderr line with no path.
  - Property tests `scan-statements.property.test.ts` (100 runs; CSV text from `statementSetArb` written to temp folders; Histories: empty, or the one left by first scanning a random prefix of the months): **P1** shuffling files and names gives deeply equal summaries apart from `scanId` (Req 4.7); **P2** `[a]` and `[a, a]` give the same summary apart from `scanId` and `files` (Req 4.8); **P3** two scans in a row of unchanged files: the second has empty `newUndead`, `possessed`, `trialTraps` and `risenAfterBurial`, and the same `undead` and `yearlyTotals` (Req 5.10); **P4** no marker from `markersOf` appears in the summary JSON unless it survives in a Display name of an `undead` entry, no one-off amount from `oneOffAmountsOf` appears as a number or Money text, no processor residue marker appears, and no object anywhere in the JSON has a `key`, `merchantKey` or `id` field (Req 5.8, 5.11).
  - Run `npm run build`.
  - Tests: `npx vitest run mcp/src scripts/build-fresh.test.ts`.
  - Existing tests: `mcp/src/scan-statements.test.ts` (task 6 and 12 cases kept unchanged; new cases added). `bury.test.ts`, `bundle.test.ts` and `history-lock.two-process.test.ts` pass unchanged.
  - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.8, 5.9, 5.10, 5.11, 7.2, 7.3, 7.4, 7.11, 16.1, 16.2, 16.3, 16.4_

> **Batch 4 done:** reviewer runs `npm test`, `npm run typecheck` and `npm run lint`, all green; P1–P6 and P11 pass; the round-1 scan still gives 6 undead and $1,181.40 a year; no summary in any test holds a `key`, `merchantKey` or `id`.

---

## Batch 5: bury, unbury, graveyard and the folder setting (design steps 9 and 10)

After this batch the MCP server has all five tools. `unbury` (Req 6.7, 6.10) is a Should item; if it is dropped, task 18 keeps only its `bury` part and P7 goes.

- [ ] 18. Resolver, full `bury` and `unbury` (`mcp/src/resolve-service.ts`, `mcp/src/bury.ts`, `mcp/src/unbury.ts`)
  - `resolve-service.ts`: `Resolution<E>` and `resolveService(text, entries)` exactly as design "Resolving the service text", steps 1 to 5: over 200 code points → `none` with no candidates; the whole text as a name first, the amount suffix regex only when that gives `none` (review-design-1 #9); levels `serviceId`, then `merchant`, then a prefix of at least 2 code points, all with `foldName`; amount filter; candidates (contains, then longest common prefix of at least 2), ordered by name, amount, key, at most 5.
  - `bury.ts`: replace the skeleton resolution with `resolveService(service, currentCharges(history))`; the already-buried check runs `matchRecords` with the one-element pseudo-subscription of design "`bury`" step 1 against the Tombstones. `several` → `ambiguous`, `none` → `not-found`, with candidates `{ name, amountText: moneyText(…), cadence }` taken only from the Current charges (Req 6.4). Everything else stays as in tasks 8 and 12.
  - `unbury.ts`: inside the lock, `resolveService(service, tombstones)` (a Tombstone's `name` read through a `merchant` accessor); `one` → remove it, `saveHistory` once, `{ ok: true, name }`; `none` / `several` → `not-found` / `ambiguous` with candidates from the Tombstones. It never reads the Statements folder (Req 6.9). Register `unbury` in `tools.ts` and `server.ts` with the same strict schema as `bury` and the design's description.
  - Unit tests `resolve-service.test.ts`: each level wins over the next; `Spotify 16.99`, `Spotify $16.99`, `Spotify USD 16.99`, `Spotify 16,9` (1690) and `Spotify 17` (1700); `Xbox 360` resolves to an entry named `Xbox 360` before any amount split; 201 code points → `none` with `[]`; two Spotify entries at different amounts → `several` with both, then one with the amount; candidate order and the cap of 5; a one-letter prefix gives no prefix hits.
  - Unit tests `bury.test.ts` (tasks 8 and 12 cases kept): `ambiguous` with candidates naming only charges in the History; a charge not in the last scan is not a Current charge; the already-buried check matches through pass 2 after the subscription's id changed.
  - Unit tests `unbury.test.ts`: bury then unbury of Netflix leaves `history.json` byte-equal to the file before the bury; `not-found` with Tombstone candidates; `history-newer`; the folder renamed away does not matter.
  - Property tests `bury.property.test.ts` (100 runs; Histories from scanning `statementSetArb` sets and applying random bury sequences): **P7** (Should) for every Current charge `e` that is not buried and whose Display name resolves only to `e`, `bury(e.merchant)` then `unbury(e.merchant)` gives a History deeply equal to the one before (Req 6.10); **P8** (bury part) for every sequence of `bury` and `unbury` calls, no Tombstone `key` occurs twice (Req 6.11).
  - In `bundle.test.ts`, the expected names become `["bury", "scan_statements", "unbury"]`.
  - Run `npm run build`.
  - Tests: `npx vitest run mcp/src scripts/build-fresh.test.ts`.
  - Existing tests: `mcp/src/bury.test.ts` (cases added; earlier cases unchanged) and `mcp/src/bundle.test.ts` (expected names only).
  - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.7, 6.9, 6.10, 6.11, 16.7, 16.8_

- [ ] 19. Graveyard summary and `list_graveyard` (`shared/src/graveyard-summary.ts`, `mcp/src/list-graveyard.ts`)
  - `graveyard-summary.ts`: `graveyardView(history, timeZone)` exactly as design "Graveyard summary": `tombstones` sorted by `buriedAt` descending, then `name`, then `key`, mapped to `TombstoneView`; `savings` per currency; `months` from scan local months and burial months, oldest first, with carried-forward `undeadCount` and `yearlyTotals`, `null` before the first scan, and `buriedCount` and `cumulativeSavings` up to each month's last day.
  - `list-graveyard.ts`: `readHistory` with no lock and no write; `ok` → `{ ok: true, ...graveyardView(history, timeZone) }`; `history-unreadable` and `history-newer` returned as reasons. Register `list_graveyard` with input `z.object({}).strict()` and the design's description.
  - Unit tests `graveyard-summary.test.ts`: a month with a burial and no scan carries the previous month's values forward; months before the first scan have `null`; a scan at `2026-12-01T03:00:00Z` falls in November in `America/Los_Angeles` and December in `UTC`; two scans in one month use the last; a guessed Tombstone counts in `guessedCount` and not in `yearlySavingCents`; no `key` or `merchantKey` in the output.
  - Unit tests `list-graveyard.test.ts`: empty Data dir → `ok` with no Tombstones and no months; after a scan and a bury → one Tombstone and one month; an unreadable file returns `history-unreadable` and is not renamed.
  - Property tests `graveyard-summary.property.test.ts` (≥200 runs, `validHistoryArb`): **P8** (savings part) `savings[c].yearlySavingCents` equals the sum of non-null `yearlySavingCents` of the Tombstones in currency `c`, and `guessedCount` the number with `null` (Req 6.11); the last month's `buriedCount` equals the number of Tombstones.
  - In `bundle.test.ts`, the expected names gain `list_graveyard`.
  - Run `npm run build`.
  - Tests: `npx vitest run shared/src mcp/src scripts/build-fresh.test.ts`.
  - Existing tests: `mcp/src/bundle.test.ts` (expected names only).
  - _Requirements: 6.8, 6.11, 15.2, 16.8_

- [ ] 20. `set_statements_folder` (`mcp/src/set-statements-folder.ts`)
  - Implement exactly design "`set_statements_folder`", steps 1 to 7: `~` / `~/` expansion only; `not-absolute`; `path.resolve`; `realpath` (`ENOENT` → `not-found`, `EACCES`/`EPERM` → `not-readable`); `not-a-folder`; `inside-app` when the real path equals or is under `realpath(appRoot) + sep` (covers the Data dir, Req 3.3); `readdir` failure → `not-readable`; write `encodeSettings({ version: 1, statementsFolder: <resolved path> })` with `writeFileAtomic` (no lock); return `{ ok: true, folderName, statementFileCount }` counting with `listStatementFiles`. The path never appears in a result or a log line (Req 3.5). Register it with input `z.object({ path: z.string().min(1).max(4096) }).strict()` and the design's description, which says the path reaches the model provider and Crew's transcripts and that editing `data/settings.json` keeps it on the machine (Req 3.6).
  - Unit tests `set-statements-folder.test.ts`: every reason, each leaving `settings.json` absent or byte-equal; `~/x` expands to `os.homedir()` (use a temp `HOME`); `~other/x` gives `not-absolute`; a symlink outside the app pointing into the App root gives `inside-app`; the Data dir itself gives `inside-app`; success returns the last path segment and the CSV count, and a later `scan_statements` reads that folder; no result or captured stderr line contains the path.
  - In `bundle.test.ts`, the expected names are the five tools `["bury", "list_graveyard", "scan_statements", "set_statements_folder", "unbury"]` (Req 2.10).
  - Run `npm run build`.
  - Tests: `npx vitest run mcp/src scripts/build-fresh.test.ts`.
  - Existing tests: `mcp/src/bundle.test.ts` (expected names only).
  - _Requirements: 2.10, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

> **Batch 5 done:** reviewer runs `npm test`, `npm run typecheck` and `npm run lint`, all green; the bundle lists the five tools; P7 and P8 pass; `bury`, `unbury` and `list_graveyard` never open the Statements folder.

---

## Batch 6: agent and skill text, and the demo (design step 11)

- [ ] 21. Complete skill and agent text (`skills/reaper/SKILL.md`, `agents/reaper.json`, `app.json`, `app-manifest.test.ts`, `skill-text.test.ts`)
  - Read the "Telegram" section of `spike-2026-11-17.md`. If it has a "Fallbacks chosen" list (task 9), apply each fallback it names, and only those, in the places of design "Telegram isolation": the Delivery section's argument (`session: "telegram"` or `channel_type: "telegram"`, or "do not send; your reply is delivered"), `allowedTools` gaining `"@kirocrew-core/send_message"`, the cron's `silent`, and the alert's last line. If the section or the list is missing, keep the design defaults. Name what was applied in the task notes.
  - Complete `SKILL.md` with all eight sections of design "Skill", in order: 1 Rules (unchanged from task 5 apart from wording fixes), 2 Monthly round (all four branches, including "something to report" for any non-empty `newUndead`, `possessed`, `trialTraps`, `risenAfterBurial`, or `firstScan`, or `historyReset`), 3 Alert wording (every template line, the first-count template with one clause per currency and the guessed clause, the risen and reset lines in the first-count message too, cadence words, no date range, file count or folder name), 4 Delivery (the only section naming `send_message` and `session` or `channel_type`), 5 Setting the folder, 6 Scan on request, 7 Bury (the Tombstone line, link with at most 3 steps and the App Store note, email with subject, a code block body and the `mailto` link, the closing line "You still need to cancel with the service; I only draft it.", `alreadyBuried`, candidates as `<name>, <amountText> a <cadence word>` with the `bury <name> <amount>` hint, `no-scan`, never guess), 8 Unbury and graveyard. No detection or classification rules (Req 9.10).
  - Check the agent `prompt` holds the five outline points of design "Agent" and nothing that grants a tool.
  - Extend `app-manifest.test.ts`: the agent prompt contains `read`, `glob`, `grep`, `raw JSON`, `path` and `Delivery section` (Req 8.2, 8.4); if a fallback changed `silent` or `allowedTools`, the expected cron object and `allowedTools` follow the spike file's choice, named in a comment.
  - Unit tests `skill-text.test.ts` (design "Skill"): front-matter `name: reaper`, the `description`, `triggers` a string containing `bury`, `unbury`, `graveyard`, `scan my statements` and `reaper`, and `always: false` (Req 9.1); the eight section headings in order; `send_message`, `session` and `channel_type` occur only inside section 4 (Telegram isolation); the template lines of section 3 and the fixed D2 text "The Reaper has no statements folder yet. Set it in the Crew dashboard chat." are present; the last alert line is either `Reply "bury <name>" and I will draft the cancellation.` or `Reply "bury <name>" in the Reaper's dashboard chat and I will draft the cancellation.`; "All quiet in the graveyard this month." is present; the Rules section repeats the prohibition sentence of the agent prompt word for word (Req 9.11, 8.2); no `!` outside fenced code; "zombie" only inside the Rules section; none of "act now", "before it's too late", "fraud" or "unused" outside the Rules section (Req 9.5).
  - Tests: `npx vitest run app-manifest.test.ts skill-text.test.ts`.
  - Existing tests: `app-manifest.test.ts` (prompt cases added; the expected cron object and `allowedTools` change only if a recorded fallback says so).
  - _Requirements: 3.6, 8.1, 8.2, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 10.1_

- [ ] 22. Round-2 demo files and the demo test (`mcp/fixtures/demo/round-2/`, `mcp/src/demo.test.ts`)
  - Create `round-2/2026-07.csv` to `2026-09.csv` in the round-1 format (design "Demo statements"): the same services and days as round 1, except `NETFLIX.COM` at 17.99 and a new `PARAMOUNT+` at 11.99 on Jul 4, Aug 4 and Sep 4; new one-off rows with amounts that differ from every recurring amount and yearly cost. Fake data only.
  - Unit tests `demo.test.ts` (design "Demo test", Req 14.4): every demo file parses as `mapped` with `detectedSignConvention.convention === "positive-out"`; scanning round 1 into a fresh Data dir gives `firstScan`, 6 undead and USD `yearlyCostCents` 118140; copying round 2 in and scanning again gives exactly one `newUndead` (name `Paramount+`, `amountCents` 1199, `yearlyCostCents` 14388) and exactly one `possessed` (Netflix, `fromAmountCents` 1549, `toAmountCents` 1799, `increasePerYearCents` 3000); every undead has a non-null `serviceId`; `bury Netflix` gives a link and `bury Planet Fitness` an email.
  - Tune only description text, in round 1 and round 2, until Core recognises every service; the amounts and days above do not change. If Core does not label the Netflix change `possessed`, or does not detect Paramount+ from three charges, stop and explain (the amounts are fixed by design). The task 6 and task 8 tests must still pass after any description change.
  - Tests: `npx vitest run mcp/src/demo.test.ts mcp/src/scan-statements.test.ts mcp/src/bury.test.ts mcp/src/read-statements.test.ts`.
  - Existing tests: none change (fixture descriptions may change; the tests that read them pass unchanged).
  - _Requirements: 9.4, 14.3, 14.4, 14.6_

> **Batch 6 done:** reviewer runs `npm test`, `npm run typecheck` and `npm run lint`, all green; the demo test gives exactly the alert of design "Demo statements"; the skill holds `send_message` only in its Delivery section.

---

## Batch 7: dashboard backend and page (Should; design steps 12 and 13)

Requirements 11 and 12 are Should items. If they are dropped, the stub backend and stub page of task 3 stay, and Req 11 and 12 are reported as not done at the checkpoint. The backend imports only `shared/src/`, never `mcp/` (design "Shared module"). It reads `data/history.json` with `readFile` and `decodeHistory`, with the same outcomes as `readHistory` (missing → empty History; `unreadable` → `history-unreadable`; `newer` → `history-newer`) and no lock, rename or write.

- [ ] 23. Backend env, replay cache and proxy check v2 (`backend/src/env.ts`, `backend/src/replay-cache.ts`, `backend/src/proxy-check.ts`)
  - `env.ts`: `readBackendEnv(env)` → `{ ok: true, port, secret }` or `{ ok: false, bad: "PORT" | "KIROCREW_PROXY_SECRET" }`, as design "Start": `PORT` matches `/^[1-9][0-9]{0,4}$/` and is at most 65535; the secret is a non-empty string.
  - `replay-cache.ts`: `ReplayCache` with `maxEntries = 4096` and `accept(nonce, expiresAt, now)` as design: delete entries with `expiry < now`, refuse a present nonce or a full map, else store and accept.
  - `proxy-check.ts`: `ProxyV2Input` and `verifyProxyV2` exactly as the design code block, step for step (`tsStr` signed as received; replay check last).
  - Fixed vector: run Crew's own signer once on this machine, e.g. `~/.kiro/crew-venv/bin/python -c "from kiro_crew.apps.proxy_auth import sign_proxy_request_v2; …"`, calling it as `apps/proxy_auth.py` defines it, with a fixed secret, ts, nonce, method `GET`, target `/api/graveyard?x=1` and an empty body, and paste the inputs and the resulting header into the test as literals with a comment naming the command. The test never runs Python. If the venv or the function is missing, stop and explain.
  - Unit tests `env.test.ts`: `PORT` `0`, `65536`, `08`, `80a`, missing → bad `PORT`; empty or missing secret → bad `KIROCREW_PROXY_SECRET`; `PORT` `1` and `65535` ok.
  - Unit tests `replay-cache.test.ts`: second use refused; an expired entry is purged and its nonce accepted again; a full cache refuses a new nonce and does not evict.
  - Unit tests `proxy-check.test.ts`: the Python vector accepted at its ts and refused on a second use; a leading-zero ts signed as sent is accepted; a ts 61 s off is refused and 60 s off accepted; a doubled header joined with `", "` is refused; an array value is refused; a nonce of 31 or 33 characters or with upper case is refused; an empty signature is refused.
  - Property tests `proxy-check.property.test.ts` (**P10**, ≥200 runs): a reference v2 signer written in the test from `apps/proxy_auth.py` (`createHmac` over `v2:<ts>:<nonce>:<METHOD>:<target>:<sha256 hex of body>`), independent of `verifyProxyV2`; for arbitrary secrets, methods, targets, bodies and ts within ±60 s, the signed header is accepted once with a fresh cache and refused the second time; changing one character of the ts, the signature or the nonce, or the method, target or body, or moving the ts outside the window, is refused (Req 11.9).
  - Tests: `npx vitest run backend/src`.
  - Existing tests: none change.
  - _Requirements: 11.2, 11.4, 11.9, 16.10_

- [ ] 24. Backend routes, server and bundle test (`backend/src/routes.ts`, `backend/src/server.ts`, `backend/src/bundle.test.ts`)
  - `routes.ts`: `handle({ method, url, headers, body }, { dataDir, secret, cache, nowSeconds, timeZone })` → `{ status, json }`, following design "Request handling" steps 1, 3, 4 and 5: `GET /api/health` (exact `url`) → `200 {"ok":true}` with no check and no file read; then `verifyProxyV2` (failure → `401 {"error":"unauthorized"}`); then method other than `GET` → `405`; path (before `?`) other than `/api/graveyard` → `404`; then reading `data/history.json` as the batch intro says → `200 { ok: true, ...graveyardView(history, timeZone), lastScan }` or `200 { ok: false, reason }`. No write, rename or lock; no Settings file or statement read (Req 11.5–11.7).
  - `server.ts`: replace the stub. `readBackendEnv(process.env)`; on a bad variable write `reaper-backend: bad env <NAME>` to stderr and exit 2. `dataDir = join(process.cwd(), "data")`; one `ReplayCache` for the process; listen on `127.0.0.1:<port>`. Read the body as a `Buffer`: `content-length` above 16,384, or a running total above it, → `413` and `req.destroy()` after the response (step 2). A failed check logs `reaper-backend: proxy check failed` with no header value. Every response has `content-type: application/json; charset=utf-8` and `cache-control: no-store`. `timeZone` from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - Unit tests `routes.test.ts` (headers built with the test's own reference signer, as in task 23): health without headers; 401 for no headers, a bad signature and a replay; 405 for a signed `POST`; 404 for a signed `GET /api/other`; a signed `GET /api/graveyard` on an empty Data dir, on a History with one scan and one Tombstone (no `key` or `merchantKey` in the JSON), on an unreadable file (`history-unreadable`, not renamed) and on `version: 2` (`history-newer`); the Data dir's names, sizes and mtimes are unchanged after all requests (Req 11.6).
  - Bundle test `backend/src/bundle.test.ts` (design "Bundle start tests"): spawn `backend/dist/server.js` with `cwd` a temp App root, a free `PORT` and a test secret, and `env` holding only those and `PATH`; `GET /api/health` is `200 {"ok":true}`; an unsigned `GET /api/graveyard` is `401`; a signed one is `200`; a body of 16,385 bytes is `413`; starting with `PORT=0` exits with code 2 and stderr names `PORT` and not its value (Req 11.2).
  - Run `npm run build`.
  - Tests: `npx vitest run backend/src scripts/build-fresh.test.ts app-manifest.test.ts`.
  - Existing tests: none change.
  - _Requirements: 1.3, 2.10, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 15.2_

- [ ] 25. Page data and states (`ui/src/app-sdk.d.ts`, `ui/src/graveyard-response.ts`, `ui/src/page-text.ts`, `ui/src/graveyard-page.tsx`, `ui/src/index.tsx`)
  - `app-sdk.d.ts`: the ambient module of design "Ambient types" (only `useAppApi().get`).
  - `graveyard-response.ts`: `isGraveyardResponse(value)`, a structural guard over `GraveyardResponse` and the `{ ok: false, reason }` reply (design "Entry"); it checks every field the page reads, including integer cents and currency codes.
  - `page-text.ts`: every sentence on the page, in the tone of Req 9.5: "Reading the graveyard…", "The graveyard could not be read.", "Try again", "Nothing buried yet. The Reaper checks your statements on the 1st of each month.", "The graveyard", and the functions for the data view's sentences (task 26 adds to this file). No `!`.
  - `graveyard-page.tsx`: `GraveyardPage` calls `useAppApi()` and, in an effect, `api.get("/apps/zombills-reaper/api/graveyard")`. States as the design table: loading in a `role="status"` region; error (throw, guard failure or `ok: false`) with a native `<button>` "Try again" that repeats the request; empty (`ok`, no Tombstones and no scans); data (a placeholder `<h1>` "The graveyard" until task 26). After a successful retry, focus moves to the `<h1>` (it has `tabIndex={-1}`). Imports only `react`, `@kirocrew/app-sdk`, and from `../../shared/src/` the types, `moneyText` and `localDate`; no `react-dom`, `lucide-react` or `react/jsx-runtime`. Each `.tsx` file starts with `import { createElement as h } from "react"` (and `Fragment` when used).
  - `index.tsx`: as design "Entry" (`export function mount()` returning `<GraveyardPage />`, and the same as default).
  - Component tests `graveyard-page.test.tsx` (jsdom, `vi.mock("@kirocrew/app-sdk")`): loading shows "Reading the graveyard…" in a status region; a rejecting `get` shows the error text and "Try again", and a second `get` that resolves shows the data heading and moves focus to it; a reply failing the guard shows the error state; `ok: false` shows the error state; an empty reply shows the empty sentence; `get` was called with exactly `/apps/zombills-reaper/api/graveyard`.
  - Unit tests `graveyard-response.test.ts`: a valid response, a valid `ok: false`, and refusals for a missing field, a fractional cent value, a lower-case currency and a non-array `tombstones`.
  - Run `npm run build`.
  - Tests: `npx vitest run ui/src scripts/build-fresh.test.ts`.
  - Existing tests: none change.
  - _Requirements: 12.1, 12.2, 12.6, 12.7, 12.8, 15.2_

- [ ] 26. Page data view and bundle text check (`ui/src/savings-headline.tsx`, `timeline-table.tsx`, `timeline-chart.tsx`, `tombstone-list.tsx`, `graveyard-page.tsx`, `page-text.ts`, `ui/src/bundle-text.test.ts`)
  - Build the data view of design "Dashboard page", points 1 to 4: `SavingsHeadline` (the `<h1>`, one "You save <money> a year" line per currency in `savings` key order, "<n> saving(s) not counted (cadence guessed)" when `guessedCount > 0`, and "Nothing buried yet." plus the last scan line when there are scans and no Tombstones); the last scan line "Last checked <local date>, statements <from> to <to>." (the date from `localDate` in `shared/src/local-date.ts` with the browser's zone); `TimelineTable` (caption "Month by month"; columns Month, Undead, Yearly cost, Buried, Saved so far; money values joined by ", "; "—" for `null`); `TimelineChart` (Should; inline SVG, `aria-hidden="true"`, `currentColor`, the largest currency's yearly cost as bars and cumulative savings as a line, no number the table lacks); `TombstoneList` (newest first: name as text, "<money> a <cadence word>", "saves <money> a year" or "saving not counted (cadence guessed)", "buried <date>"). Money only through `moneyText`; styling with inline `style` objects, relative units and inherited colours; no fonts, images, external styles or scripts (Req 12.5).
  - Component tests in `graveyard-page.test.tsx` (task 25 cases kept): data with USD and GBP gives two headline lines and table rows with two money values; a guessed-cadence Tombstone shows "saving not counted (cadence guessed)" and is not in the headline total; the Tombstones are newest first; the table is present whenever the chart is, and the chart's `svg` has `aria-hidden="true"`; every button is a native `<button>` reachable by Tab.
  - Unit tests `bundle-text.test.ts` (design "Component tests", static part): `ui/dist/index.mjs` contains no `http://` and no `https://`; its bare import specifiers are exactly a subset of `react` and `@kirocrew/app-sdk`; it contains no `react/jsx-runtime`, `react-dom` or `lucide-react` import.
  - Run `npm run build`.
  - Tests: `npx vitest run ui/src scripts/build-fresh.test.ts`.
  - Existing tests: `ui/src/graveyard-page.test.tsx` (data-view cases added; the task 25 cases unchanged except the data case, which now finds the full view instead of the placeholder heading only).
  - _Requirements: 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

> **Batch 7 done:** reviewer runs `npm test`, `npm run typecheck` and `npm run lint`, all green; P10 passes against the Python vector and the reference signer; the backend bundle answers health, 401, 413 and exits 2 on a bad env; the page bundle imports only `react` and `@kirocrew/app-sdk`.

---

## Batch 8: privacy checks, README, steering and the final check (design steps 14, 15 and 16)

- [ ] 27. Privacy tests and the `.gitignore` check (`scripts/privacy-source.test.ts`, `scripts/privacy-bundle.test.ts`, `mcp/src/privacy-network.test.ts`, `mcp/src/privacy-logs.test.ts`, `mcp/src/data-dir-files.test.ts`, `app-manifest.test.ts`)
  - Tests only. If a privacy test finds a leak, fix the code that leaks and name it in the task notes; never add an exception to make a test pass, except the bundle allowlist rule below.
  - `privacy-source.test.ts` (design "Privacy enforcement", row 1, Req 13.1): read every `.ts` and `.tsx` file under `shared/`, `mcp/`, `backend/`, `ui/` and `scripts/`, excluding `**/dist/**`, test files and `test-*.ts` helpers, and fail on any of `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `http.request`, `https.request`, `http.get`, `https.get`, `net.connect`, `tls.connect`, `dgram`, `dns` (as a word or a `node:dns` import) and `EventSource`, and on `child_process` in any file other than `scripts/sync-core.ts`. It also fails on an `@modelcontextprotocol/sdk` import other than `server/mcp.js` and `server/stdio.js`. The failure names the file and line.
  - `privacy-bundle.test.ts` (row 2): scan the three bundles for the same tokens. A hit fails unless it matches a named allowlist entry `{ library, excerpt }` with the exact excerpt; the first entry is papaparse's `NetworkStreamer` (`XMLHttpRequest`, used only with `download: true`, which Core never sets). Each entry the test does not find also fails, so the allowlist cannot go stale. Add an entry only for a hit inside an inlined library and name the library in the task notes.
  - `privacy-network.test.ts` (row 4, Req 13.2): replace `globalThis.fetch`, `http.request`, `https.request` and `net.connect` with functions that fail the test, restore them in `afterEach`, and run `set_statements_folder`, `scan_statements` on round 1, then on round 1 plus round 2, `bury Netflix`, `unbury Netflix` and `list_graveyard` through `createReaperTools` on a temp Data dir. All succeed and no stub is called.
  - `privacy-logs.test.ts` (row 5, Req 13.3): through `test-mcp-client.ts`, run the MCP bundle from a temp App root and call `set_statements_folder`, `scan_statements` (round 1, then round 1 plus round 2), `bury Netflix` and `bury Planet Fitness`; collect stderr (stdout frames are parsed and dropped). Then start the backend bundle on the same Data dir and send a signed `GET /api/graveyard`; collect its stdout and stderr. Fail on any demo description, any demo amount (recurring and one-off) in each of the forms `1549`, `15.49` and `$15.49`, any merchant or Display name from the demo set, and the folder path or its last segment.
  - `data-dir-files.test.ts` (row 6, Req 13.4): after `set_statements_folder` and a scan, the Data dir holds only `settings.json` and `history.json` (no `history.lock`, no temp file); after an unreadable History and a scan, also one `history.unreadable-*.json`; after a History with a bad record, also one `history.backup-*.json`; a file the test drops in as "written by Crew" is ignored. The Statements folder's names, sizes and mtimes are unchanged.
  - In `app-manifest.test.ts`, add the `.gitignore` check (Req 15.5) with `git check-ignore -q`: `node_modules/x` and `data/settings.json` are ignored; `vendor/zombills-core/SOURCE`, `.kiro/steering/privacy.md`, `mcp/dist/server.js`, `backend/dist/server.js` and `ui/dist/index.mjs` are not.
  - Tests: `npx vitest run scripts/privacy-source.test.ts scripts/privacy-bundle.test.ts mcp/src/privacy-network.test.ts mcp/src/privacy-logs.test.ts mcp/src/data-dir-files.test.ts app-manifest.test.ts`.
  - Existing tests: `app-manifest.test.ts` (the `.gitignore` case added; other cases unchanged).
  - _Requirements: 3.5, 4.6, 5.8, 13.1, 13.2, 13.3, 13.4, 15.5_

- [ ] 28. README and steering corrections (`README.md`, `.kiro/steering/tech.md`, `privacy.md`, `structure.md`, `product.md`)
  - Read the "Skeleton checks" and "Telegram" sections of `spike-2026-11-17.md` if they exist. Where a README line depends on a Telegram result (routing with `/agent reaper`, what the user loses in that chat, how to switch back, the agent's real tool surface), write the recorded result; if it is not recorded yet, write the design default and mark it "(not yet tested on Telegram)".
  - `README.md`, sections in this order: what the Reaper does (the one-sentence pitch of `product.md`); privacy in three sentences, then its limits: built-in `read`, `glob` and `grep` are mounted and only the prompt keeps the agent off the files, the path given to the agent reaches the model provider, and Crew keeps alert text in `~/.kiro/crew/cron-history` and transcripts in kiro-cli's `<kiro home>/sessions/cli/<sid>.jsonl` and Crew's `data_home()/sessions` (design "Steering corrections", Req 3.6, 8.3, 14.1); install on the local Mac (Crew 0.12.2; check `<repo>/data` does not exist; `kirocrew app install <repo path>`; enable in the dashboard, Apps → Library → The Reaper → Enable, and never set `agent.apps_allow_third_party`; the committed bundles need no build, `npm ci && npm run build` only after a source change, then `kirocrew app update zombills-reaper`; set Crew's timezone); Telegram (bot setup in Settings → Messaging Channels, `/agent reaper` in the bot chat, the dashboard chat fallback); the statements folder (tell the Reaper agent, or edit `data/settings.json` in the app folder to keep the path off the model provider; keep earlier statements in the folder; the same charge on two accounts on the same day counts once); run it now (`kirocrew cron list`, `kirocrew cron trigger <id>` on `zombills-reaper/monthly-scan`, or "scan my statements" in the dashboard chat; Req 10.3); the demo (round 1, first count; round 2, one new undead and one possessed; `bury Netflix` gives a link and `bury Planet Fitness` an email; Req 14.3); what the Reaper never does (cancel, log in, send email, upload statements); troubleshooting (MCP tools not showing: `node` not on the PATH kiro-cli inherits, a `KIROCREW_HOME` other than `~/.kiro/crew`; Req 14.5); "Later: your own EC2 instance" (`kirocrew cloud`; the folder and the Data dir live on that instance; no S3, no log shipping of app data; Req 14.2); license. No token, chat id, real path or real statement (Req 14.6).
  - Steering corrections exactly as design "Steering corrections" and Req 15.3, each citing its source path: `tech.md` (every listed Crew fact and spike result; "Vite library build" and "`onInstall` must install dependencies and build" replaced by the esbuild bundles with zero runtime `dependencies`); `privacy.md` (`X-Crew-Proxy` → `X-KiroCrew-Proxy-V2` with `X-KiroCrew-Proxy-Nonce`; the statements path in `data/settings.json`; built-in `read`, `glob` and `grep`; a path set through the agent reaches the model provider; rows for `cron-history` and the two transcript stores); `structure.md` (the five MCP tools; `shared/`; root tests for the manifest and the skill text); `product.md` (the statements path in the Settings file; "bury" routing through `/agent reaper`, marked pending until T4 passes).
  - Checks (paste the output into the task notes): `grep -rn "X-Crew-Proxy" .kiro/steering README.md` finds nothing; `grep -n "configSchema" .kiro/steering/*.md` shows no line saying the statements path lives there; `grep -n "scan-statements\|draft-cancellation\|draft_cancellation" .kiro/steering/structure.md` finds nothing; `grep -nE "[0-9]{6,}:[A-Za-z0-9_-]{30,}|/Users/" README.md` finds nothing; `grep -n "kirocrew cron trigger\|/agent reaper\|Later: your own EC2 instance\|settings.json\|cron-history\|sessions" README.md` finds each phrase.
  - Tests: `npx vitest run app-manifest.test.ts skill-text.test.ts`, `npm run lint` (Prettier checks the Markdown).
  - Existing tests: none change.
  - _Requirements: 3.6, 8.3, 10.3, 14.1, 14.2, 14.3, 14.5, 14.6, 15.1, 15.3_

- [ ] 29. Checkpoint: full verification and traceability review
  - Run at the repo root `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`, then `npx vitest run scripts/build-fresh.test.ts` again: the bundles on disk match a fresh build. All must pass with no network, no Crew and no Zombills repo: `grep -rn "Kiroween-Hackathon" --exclude-dir=node_modules --include="*.test.ts" --include="*.test.tsx" .` finds no test that reads that repo (Req 15.4).
  - Searches that must find nothing outside test files and `test-*.ts` helpers: in `shared/src`, `mcp/src`, `backend/src`, `ui/src`, `scripts/`: `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `console.` (in `mcp/` and `shared/`), `toFixed`, `/ 100` outside `shared/src/money.ts`, `child_process` outside `scripts/sync-core.ts`, `node:http` outside `backend/src/server.ts`, any import of `vendor/zombills-core/` by path instead of `@zombills/core`, and any import from `mcp/` in `backend/`. In tool result types and the backend reply: no `key`, `merchantKey` or `id` field. `git ls-files --cached -- data` is empty; `git status --porcelain` lists no file under `data/`, no real statement and no `node_modules/`.
  - Check that `git diff -- .kiro/specs/reaper/requirements.md .kiro/specs/reaper/design.md` is empty, and that `vendor/zombills-core/` equals a fresh `node scripts/sync-core.ts` output apart from the date line of `SOURCE` when the Zombills commit has not changed (skip this when the Zombills repo moved on; say so in the notes).
  - Traceability: list every acceptance criterion in `requirements.md` (1.1–1.8, 2.1–2.10, 3.1–3.6, 4.1–4.8, 5.1–5.13, 6.1–6.11, 7.1–7.11, 8.1–8.4, 9.1–9.11, 10.1–10.4, 11.1–11.9, 12.1–12.8, 13.1–13.5, 14.1–14.6, 15.1–15.5, 16.1–16.11) and confirm each is named in the `_Requirements:_` line of at least one task and in the table below. Then walk the table: each named test exists and passes, or, for a manual or review criterion, the check is in place or its Claude Code task is still open (say which).
  - Report any gap as a finding instead of fixing it here, unless the fix is a one-line test or text change. List any Should item that was dropped.
  - _Requirements: all; in particular 2.9, 13.1, 13.5, 15.1, 15.4, 15.5_

- [ ] 30. (Claude Code) Final live check on Crew and Telegram
  - Needs tasks 1 to 29 ticked. Exactly design step 16: confirm `<repo>/data` does not exist; `kirocrew app update zombills-reaper` (or a fresh `kirocrew app install` after removing the app); enable in the dashboard if asked; make a new demo folder outside the repo with `mcp/fixtures/demo/round-1/*.csv`; set it by telling the Reaper agent in the dashboard chat (this exercises `set_statements_folder`); `kirocrew cron trigger <id>` → the first-count message ("6 undead, $1,181.40 a year in USD") in Telegram, or in the fallback place chosen in task 9; copy `round-2/*.csv` in and trigger again → exactly the alert of design "Demo statements"; trigger a third time → nothing in Telegram and "All quiet in the graveyard this month." in the cron tab (T7); `bury Netflix` from Telegram (or the dashboard chat fallback) → link and the closing line; `bury Planet Fitness` → email with a code block and `mailto:`; `graveyard` → two Tombstones and the savings line; open the Graveyard page in the Crew dashboard → headline, table and both Tombstones; `unbury Planet Fitness` and reload the page.
  - Check `gateway.log` and `~/.kiro/crew/cron-history/<id>.jsonl` hold no statement row, description of a one-off purchase or folder path from the Reaper (Req 13.3 on the live system; record what Crew itself stores).
  - Append a "Final check" section to `spike-2026-11-17.md`, one row per step with pass or fail and the evidence. A failure is reported, not fixed in this task.
  - _Requirements: 1.2, 1.3, 1.6, 3.1, 6.3, 9.2, 9.3, 9.6, 9.7, 9.8, 10.1, 10.3, 11.4, 12.1, 12.2, 12.3, 14.3_

> **Batch 8 done:** reviewer runs `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`, all green, with no bundle change; the privacy tests pass with only named allowlist entries; the README and steering searches of task 28 come back clean; task 29 reports no unexplained gap. Task 30 records the live result.

---

## Traceability

Test names are files next to their source unless a folder is given. "AM" is `app-manifest.test.ts`; "ST" is `skill-text.test.ts`; "BF" is `scripts/build-fresh.test.ts`; "SS" is `mcp/src/scan-statements.test.ts` and "SSP" its property test; "MB" is `mcp/src/bundle.test.ts`; "BB" is `backend/src/bundle.test.ts`; "GP" is `ui/src/graveyard-page.test.tsx`. "Live" means a Claude Code task records the result in `spike-2026-11-17.md`.

| Req | Covered by | Task |
| --- | --- | --- |
| 1.1 | AM | 5 |
| 1.2 | AM (`mcpServers` object); live start | 5, 7, 30 |
| 1.3 | AM (`agents`, `skills`, `backend`, `ui`); BB | 5, 24, 30 |
| 1.4 | AM (no `onInstall`); BF; MB and BB run with no `node_modules`; live "Installing npm deps" | 3, 5, 6, 7 |
| 1.5 | AM (`configSchema`) | 5 |
| 1.6 | AM (exact `permissions`) | 5, 30 |
| 1.7 | AM (no `/Users/`, `${HOME}` or token shape) | 5 |
| 1.8 | AM (named files committed, MCP path from the `-c` string) | 5 |
| 2.1 | `sync-core.test.ts` | 2 |
| 2.2 | `sync-core.test.ts` (copy, test and map files left out) | 2 |
| 2.3 | `sync-core.test.ts` (`SOURCE`, `-dirty`) | 2 |
| 2.4 | `sync-core.test.ts` (each failure leaves the old copy) | 2 |
| 2.5 | `sync-core.test.ts` (no symlink); `privacy-source.test.ts` | 2, 27 |
| 2.6 | BF and AM (no `dependencies`, no lifecycle scripts, lock committed) | 1, 2, 3, 5 |
| 2.7 | `sync-core.test.ts` (committed `SOURCE` format) | 2 |
| 2.8 | BF (determinism, `SOURCE` embedded); `bundle-text.test.ts` (page externals) | 3, 26 |
| 2.9 | BF, run by every task that changes bundled source | 3 and later |
| 2.10 | MB (five tools, `not-configured` from the temp Data dir); BB (`/api/health`) | 6, 20, 24 |
| 3.1 | `set-statements-folder.test.ts`; live | 20, 30 |
| 3.2 | `set-statements-folder.test.ts` (each reason, Settings unchanged) | 20 |
| 3.3 | `set-statements-folder.test.ts` (`inside-app`, link into the App root, Data dir) | 20 |
| 3.4 | `settings-codec.test.ts`; SS (`not-configured`) | 6, 10, 20 |
| 3.5 | `set-statements-folder.test.ts` (no path in results or stderr); `privacy-logs.test.ts` | 20, 27 |
| 3.6 | Tool description; ST (section 5); README | 20, 21, 28 |
| 4.1 | `statement-files.test.ts` (links, sub-folders, folder unchanged); SS | 6, 13, 17 |
| 4.2 | `statement-files.test.ts`, `read-statements.test.ts` (every skip kind, 120 cap) | 13, 17 |
| 4.3 | `decode-bytes.test.ts` | 13 |
| 4.4 | `merge-transactions.property.test.ts` (largest count kept) | 14, 17 |
| 4.5 | SS and SSP run Core's Pipeline unchanged; checkpoint review | 17, 29 |
| 4.6 | `read-statements.test.ts`; SSP (P4); `privacy-logs.test.ts`; Display name cap (P12) | 4, 13, 17, 27 |
| 4.7 | P1 | 14, 17 |
| 4.8 | P2 | 14, 17 |
| 5.1 | SS | 6, 17 |
| 5.2 | `scan-diff.test.ts` (entry fields, label order, sort) | 16 |
| 5.3 | `scan-diff.test.ts` (first scan, blocked); `match.test.ts` | 15, 16 |
| 5.4 | `scan-diff.test.ts` (possessed once, after a dip, already possessed when new) | 16 |
| 5.5 | `scan-diff.test.ts` (trial trap once) | 16 |
| 5.6 | `scan-diff.test.ts` (risen at 3 and 4 days, once per date) | 16 |
| 5.7 | `money.test.ts`; SS (USD total); P5 | 4, 6, 16 |
| 5.8 | SS (no `key`, `merchantKey`, `id`); SSP (P4); `privacy-logs.test.ts` | 4, 6, 17, 27 |
| 5.9 | SS (`ok: false` leaves the file); `history-lock.test.ts` (`history-busy`); `internal-error` case | 12, 17 |
| 5.10 | P3 | 17 |
| 5.11 | P4 | 17 |
| 5.12 | P5 | 16 |
| 5.13 | P6; `scan-diff.test.ts` (ended series, missing for two scans, one write) | 15, 16 |
| 6.1 | `resolve-service.test.ts`; `bury.test.ts` (`no-scan`, 200 code points) | 8, 18 |
| 6.2 | `bury.test.ts` (Tombstone fields, `TombstoneView`) | 4, 8, 18 |
| 6.3 | `cancel-draft.test.ts` (link and email from real Core data); live | 8, 30 |
| 6.4 | `bury.test.ts` and `resolve-service.test.ts` (candidates only from Current charges, cap 5) | 18 |
| 6.5 | `bury.test.ts` (`alreadyBuried`, nothing written, pass-2 match) | 8, 18 |
| 6.6 | `scan-diff.test.ts` (Tombstone answers passed to `classifySubscriptions`) | 16 |
| 6.7 | `unbury.test.ts` | 18 |
| 6.8 | `graveyard-summary.test.ts`, `list-graveyard.test.ts` | 19 |
| 6.9 | `bury.test.ts` and `unbury.test.ts` (folder renamed away) | 8, 18 |
| 6.10 | P7 | 18 |
| 6.11 | P8 | 18, 19 |
| 7.1 | `history-codec.test.ts`; types under typecheck | 4, 10 |
| 7.2 | `history-store.test.ts` (missing file); SS (first scan) | 11, 17 |
| 7.3 | `history-codec.test.ts`, `history-store.test.ts` (rename, keep 3); SS and `bury.test.ts` (`historyReset`) | 10, 11, 12, 17 |
| 7.4 | `history-codec.test.ts`, P9 (one bad record), `history-store.test.ts` (backup); SS (`historyDropped`) | 10, 11, 17 |
| 7.5 | `history-codec.test.ts` (`newer`); `history-store.test.ts`; SS and `bury.test.ts` | 10, 11, 12 |
| 7.6 | `data-files.test.ts` (atomic write); `history-lock.test.ts`; `history-lock.two-process.test.ts` | 11, 12 |
| 7.7 | `history-codec.test.ts` (limits) | 10 |
| 7.8 | `data-files.test.ts` and `history-lock.test.ts` (modes 0700 and 0600) | 11, 12 |
| 7.9 | P9; P12 | 4, 10 |
| 7.10 | P9 (total decode, `__proto__`) | 10 |
| 7.11 | `scan-diff.test.ts` and SS (re-baseline) | 16, 17 |
| 8.1 | AM (`tools`, `allowedTools`, no `model`) | 5, 21 |
| 8.2 | AM (prompt words); ST (Rules repeat the prohibition) | 21 |
| 8.3 | Live T8; README tool surface | 7, 9, 28 |
| 8.4 | AM | 5, 21 |
| 9.1 | ST (front-matter) | 5, 21 |
| 9.2 | ST (Monthly round branches); live T1 and T7 | 7, 21, 30 |
| 9.3 | ST (templates, no range, count or folder); live | 21, 30 |
| 9.4 | ST (templates); `demo.test.ts` (the alert's figures) | 21, 22 |
| 9.5 | ST (no `!`, "zombie" only in Rules, no urgency words) | 21 |
| 9.6 | ST (D2 text, section 5); live | 21, 30 |
| 9.7 | ST (section 7); live T5 | 9, 21, 30 |
| 9.8 | ST (section 8); live | 21, 30 |
| 9.9 | ST (risen line) | 21 |
| 9.10 | ST; review of section text | 21 |
| 9.11 | ST (Rules section) | 5, 21 |
| 10.1 | AM (exact cron object); live trigger | 5, 7, 21, 30 |
| 10.2 | AM (message holds no path, name or amount) | 5 |
| 10.3 | README; live | 7, 28, 30 |
| 10.4 | AM | 5 |
| 11.1 | BB; `routes.test.ts` | 24 |
| 11.2 | `env.test.ts`; BB (exit 2, names the variable only) | 23, 24 |
| 11.3 | `routes.test.ts` (health without headers) | 24 |
| 11.4 | `proxy-check.test.ts` (Python vector), `routes.test.ts` (401); live page load | 23, 24, 30 |
| 11.5 | `routes.test.ts` (reply shape, errors, file not renamed) | 24 |
| 11.6 | `routes.test.ts` (405, 404, Data dir unchanged) | 24 |
| 11.7 | `routes.test.ts`; `privacy-source.test.ts`; checkpoint search (no `mcp/` import) | 24, 27, 29 |
| 11.8 | BB (413) | 24 |
| 11.9 | P10 | 23 |
| 12.1 | AM (`ui`); `bundle-text.test.ts`; GP (`mount`); live | 5, 25, 26, 30 |
| 12.2 | GP (loading, error and retry, empty, exact API path); live | 25, 30 |
| 12.3 | GP (headline, table, Tombstones, last scan, two currencies); live | 26, 30 |
| 12.4 | GP (guessed Tombstone) | 26 |
| 12.5 | `bundle-text.test.ts` (no `http(s)://`, two imports only) | 26 |
| 12.6 | GP (table always shown, chart `aria-hidden`, native buttons, focus after retry) | 25, 26 |
| 12.7 | `page-text.ts` review (no `!`, Req 9.5 tone) | 25, 26 |
| 12.8 | GP | 25, 26 |
| 13.1 | ESLint rules and probes; `privacy-source.test.ts`; `privacy-bundle.test.ts` | 1, 27 |
| 13.2 | `privacy-network.test.ts` | 27 |
| 13.3 | `privacy-logs.test.ts`; live log check | 27, 30 |
| 13.4 | `data-dir-files.test.ts` | 27 |
| 13.5 | `package.json` pins and task 1 notes; checkpoint | 1, 29 |
| 14.1 | README (install, privacy, tool surface, folder, Telegram) | 9, 28 |
| 14.2 | README (EC2 section) | 28 |
| 14.3 | README (demo); `demo.test.ts`; live | 22, 28, 30 |
| 14.4 | `demo.test.ts`; SS (round 1) | 6, 22 |
| 14.5 | README (never does, troubleshooting) | 28 |
| 14.6 | AM (token shape); task 28 README searches; fake fixtures | 5, 22, 28 |
| 15.1 | Repo layout; task 28 `structure.md`; checkpoint | 1, 28, 29 |
| 15.2 | Shared module used by `mcp/`, `backend/` and `ui/`; checkpoint search | 4, 10, 19, 24, 25 |
| 15.3 | Steering edits and task 28 searches | 28 |
| 15.4 | `sync-core.test.ts` (fake tree); `npm test` offline; checkpoint search | 1, 2, 29 |
| 15.5 | AM (`git check-ignore`) | 1, 27 |
| 16.1 | P1 | 14, 17 |
| 16.2 | P2 | 14, 17 |
| 16.3 | P3 | 17 |
| 16.4 | P4 | 17 |
| 16.5 | P5 | 16 |
| 16.6 | P6 | 15 |
| 16.7 | P7 | 18 |
| 16.8 | P8 | 18, 19 |
| 16.9 | P9 | 10 |
| 16.10 | P10 | 23 |
| 16.11 | P11 | 16 |
