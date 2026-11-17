# Review of `.kiro/specs/reaper/requirements.md`

I read the spec, the Crew 0.12.2 source, Zombills `packages/core` and its `graveyard-memory` spec. I changed no files. `design.md` and `tasks.md` don't exist yet, so traceability (checklist 9) and the code-batch checks (checklist 10) don't apply.

## Crew claims in the Introduction

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Data dir is `apps/{name}/data/`, mode 0700 | Confirmed. Crew creates it lazily | `kiro_crew/apps/manager_records.py:62-66` |
| Servers are registered as `{app}:{server}` | Confirmed | `kiro_crew/apps/bridges_mcp.py:1031` |
| kiro-cli uses the session cwd and strips env | Confirmed as Crew's stated assumption. The kiro-cli binary itself is not in the package | `bridges_mcp.py:196, 232, 821` |
| Only `.py` launchers are anchored to the app root | Confirmed | `bridges_mcp.py:185-222` |
| `${HOME}` etc. are expanded in `args`, `command` and `env` values | Confirmed | `kiro_crew/env.py:1796-1835`, `agent_materialization/mcp_sources.py:724-755` |
| Nothing tells the server where the app root is | Confirmed for a `node` command (`_pin_host_cli_command` covers host-CLI commands only) | `bridges_mcp.py:66-104, 1040-1068` |
| `configSchema` is read nowhere | Confirmed. A search of the package finds only `manifest_sections.py` | `manifest_sections.py:752` |
| Backend gets env, cwd = root, and `KIROCREW_PROXY_SECRET` | Confirmed | `kiro_crew/apps/backend.py:804-807, 897-903, 954-955` |
| `X-KiroCrew-Proxy` format, ±60 s, raw target, 502 without a secret | Confirmed | `routes_proxy.py:322-361, 351-356`; `proxy_auth.py:58, 102-141` |
| `silent` turns off auto-delivery but the result is still put in the dashboard slot | Confirmed | `slack/gateway_runtime/cron_delivery.py:113-122`; `cron_service/model.py:288` |
| `send_message` accepts `session: "telegram"` (owner DM) | Confirmed | `validation_parts/messaging_session_schemas.py:56-68`; `constants.py:1645-1757` |
| "An app cron has no creating session" | Unverified | – |
| App crons are named `{app}/{cron}`; `cron trigger` exists | Confirmed | `bridges_sources.py:89-91`; `cli_commands_cron.py:837` |
| Empty timezone falls back to the config zone, then UTC | Confirmed | `bridges_crons.py:339-342` |

## Findings

**1. Blocker: installed copy cannot start the MCP server.**
- **Where:** R1.4, R14.1, R15.5.
- **Problem:**
  - `onInstall` does not run on a local-path install.
  - `node_modules` is dropped from every installed copy.
  - So `mcp/dist/server.js` cannot resolve `@modelcontextprotocol/sdk`, `@zombills/core` or `papaparse`, and on a local install nothing is built at all.
  - The only dependency step Crew runs is `npm install --production` when the backend starts. That is a network fetch, and it may finish after kiro-cli has already started the MCP server.
- **Evidence:** `manifest_sections.py:729-733` ("A local-path install does not run it"); `manager_tree.py:108-136` (`_COPY_IGNORE` lists `node_modules`); `manager_install.py:363`; `backend.py:958-1000`.
- **Failing example:** Follow R14.1: `POST /api/apps/install {"source": "<path>"}`, then enable. kiro-cli starts `node …/mcp/dist/server.js`, which fails with `ERR_MODULE_NOT_FOUND`, and the tools are silently missing (`bridges_mcp.py:817-820`).
- **Fix:**
  - Add a criterion that `mcp/dist/server.js` and the backend entry are single self-contained ESM bundles (esbuild or Vite SSR) with all runtime code inlined, and that root `dependencies` is empty so Crew's `npm install --production` fetches nothing.
  - R14.1: run `npm ci && npm run build` before a local install.
  - R1.8: add a test that runs `node mcp/dist/server.js` from a temp copy that has no `node_modules`.

**2. Blocker: the manifest will be refused at install.**
- **Where:** R1.6, R10.1.
- **Problem:** Declaring `crons` without `permissions.cron: true` makes Crew refuse the install. R1.6 ("declare only what the app uses") never requires it.
- **Evidence:** `manifest.py:191-210, 728` (`CRON_PERMISSION_REQUIRED_ERROR`); `manifest_sections.py:617-640` (`cron=data.get("cron") is True`).
- **Failing example:** `app.json` with the R10.1 cron and `"permissions": {}` returns "crons is declared but permissions.cron is not".
- **Fix:** R1.6: "`permissions` SHALL be exactly `{ "cron": true, "mcpTools": ["send_message"] }`". Check this in R1.8.

**3. Blocker: the agent's tool list does not limit what it can call.**
- **Where:** R8.1, R8.3, R8.4.
- **Problem:**
  - The `tools` list does not limit Crew's managed tools. Crew mounts all of `kirocrew-core`, `kirocrew-cron` and `kirocrew-dashboard` into every agent unless the manifest declares `permissions.mcpTools`.
  - Base built-ins `read`, `glob` and `grep` appear to stay in any case. If so, the agent can read statement CSVs, and the raw rows then reach the model provider.
  - So the R8.4 test can pass while R8.3 is false.
- **Evidence:** `apps/permissions.py:103-143` ("mounts its OWN managed MCP servers … into every agent regardless"; "base built-ins (`read` / `glob` / `grep`) … never stripped"); `bridges_agents.py:397-457, 1030`.
- **Failing example:** The agent calls a dashboard or cron tool not in its `tools` list, or calls `read` on a CSV in the statements folder.
- **Fix:**
  - Add `permissions.mcpTools: ["send_message"]`. Crew keeps `skill_search` itself (`permissions.py:83`).
  - Change R8.3 to require a live check of the materialized `~/.kiro/agents/zombills-reaper--reaper.json`. If `read`, `glob` or `grep` are present, record them in design and README as a limit that only the prompt guards.

**4. Major: Display names can be longer than the History accepts.**
- **Where:** Glossary "Display name", R7.4.
- **Problem:** A Display name is "cut to 80 code points with '…' added", which is 81 code points. R7.4 drops any record whose merchant is over 80 code points.
- **Failing example:** A 100-character merchant is stored as 81 code points. The next decode drops it (`historyDropped: 1`), and the next scan reports it as new undead again, every month. A Tombstone with that name disappears.
- **Fix:** "cut to 79 code points followed by '…', so at most 80". Add a PBT case to R7.9 that round-trips a long merchant name.

**5. Major: the Match rule is not Zombills' Qualifying candidate rule, though the Glossary says it is.**
- **Where:** Glossary "Match", R5.13, R5.6, R6.6.
- **Problem:**
  - Zombills requires `!s.evidence.cadenceAssumed || o.cadenceAssumed`.
  - Zombills moves a record only when the candidate is unique in both directions, and on purpose rejects tie-breakers ("asking again is the safer failure").
  - R5.13 uses tie-breakers instead (same key, then earliest `firstSeenScan`, then smallest key).
- **Evidence:** Zombills `graveyard-memory/requirements.md:107, 238`; `graveyard-memory/design.md:438`; `packages/core/src/detect/ids.ts` (ids carry an amount discriminator when the Triple is shared).
- **Failing example:**
  - Setup: an `APPLE.COM/BILL` key, USD monthly. Tracked t1 is 299 (iCloud) and t2 is 999 (TV+). TV+ is buried.
  - Next month iCloud moves to 999 (`priceHistory [299, 999]`), so both ids become `…:999-1` and `…:999-2`.
  - The tie-breakers can match iCloud to t2. iCloud then gets the "not-using" answer and is labelled zombie, `risenAfterBurial` falsely says the TV+ cancellation failed, and TV+ shows as new undead.
- **Fix:**
  - Match in passes: (1) exact `id`; (2) the Qualifying candidate rule including the `cadenceAssumed` clause, accepted only when the match is unique both ways; (3) anything left over is unmatched.
  - Leftover subscriptions are reported in `newUndead` only when no Tracked charge or Tombstone with the same Triple remains unmatched; otherwise they are kept out of `newUndead`, `possessed` and `risenAfterBurial`.
  - Use the same rule for Tombstones.

**6. Major: possessed is reported again each month, and its yearly figure can contradict the message.**
- **Where:** R5.4, R9.4.
- **Problem:**
  - (a) A price that dips after a rise is reported every month.
  - (b) Core's `increasePerYearCents` is (current − first seen) × factor, not (to − from) × factor, so the alert can show figures that don't agree.
- **Evidence:** `packages/core/src/classify/types.ts` (`PriceRise.increasePerYearCents`, `latestRise`).
- **Failing example:**
  - (a) Price history 1549 → 1799 → 1749. `toAmountCents` is 1799 and the Tracked `amountCents` is 1749, so possessed is reported on every scan, and the R5.10 PBT fails.
  - (b) Price history 1399 → 1549 → 1799. The alert says "from $15.49 to $17.99 (+$48.00 a year)".
- **Fix:** Store `reportedRiseDate` on the Tracked charge and report only when `latestRise.date` is newer. Define `increasePerYearCents = (to − from) × Cadence factor` and state that it is computed in the Reaper, or report Core's `firstSeen` amount as the "from" value.

**7. Major: two of the property tests are false as written.**
- **Where:** R4.7, R4.8.
- **Problem:** R4.8 says scanning `[a]` and `[a, a]` gives the same Scan summary, but `files.read` is 1 for one and 2 for the other. R4.7 permutes file names, which fails above 120 files because the code-unit order picks a different set.
- **Fix:** Exclude `files` from the R4.8 equality. Limit R4.7 generators to ≤120 files, or state that the property holds only then.

**8. Major: the multi-file merge is under-specified.**
- **Where:** R4.4.
- **Problem:**
  - (a) Dedupe on raw `description` misses the same charge when two exports describe it differently.
  - (b) It merges real duplicates across accounts.
  - (c) The order of the merged list is not defined.
  - (d) The date format is detected per file, so one charge can parse to two different dates.
- **Failing example:**
  - (a) `NETFLIX.COM 866-579-7172` in one file and `NETFLIX.COM` in another give two charges on 2026-10-15.
  - (b) Two cards, each with its own Netflix at $15.49 on the same day, become one charge.
  - (d) `03/04/2026` read as dd/mm in one file and as mm/dd in another.
- **Fix:**
  - Key the dedupe on `(date, merchant.key, amountCents, currency)`, keeping the max-per-file count.
  - Sort the merged list by that key, code-unit order.
  - State the cross-account limit in the README.
  - Count files whose detected date format was `assumed` and ambiguous as a new skip kind.

**9. Major: Core's parse outcomes are not mapped to skip kinds.**
- **Where:** R4.2, R4.6.
- **Problem:** Core can return `status: "mapping-required"`, which none of the skip kinds covers. `rowErrors[].rawRow` holds raw cells, and R4.6 does not name it.
- **Evidence:** `packages/core/src/parse/types.ts:79-104` and `RowError.rawRow`.
- **Failing example:** A bank CSV with headers Core doesn't recognise has no defined outcome.
- **Fix:**
  - Map `"mapping-required"` to a new kind `"unknown-columns"`.
  - Map `"error"` with `EMPTY_CSV_REASON` or `NO_CONTENT_ROWS_REASON`, and a mapped result with no transactions, to `"empty"`.
  - Map any other `"error"` to `"parse-error"`.
  - R4.6: "including `rowErrors` and `rawRow`; only `rowErrors.length` may be counted."

**10. Major: concurrent History writes can lose a Tombstone.**
- **Where:** R7.6.
- **Problem:** R7.6 serialises writes only within one MCP server process. kiro-cli starts a server per session, so a cron session, a Telegram session and a dashboard chat each run their own process and read-modify-write the History independently.
- **Evidence:** `bridges_mcp.py:196` (servers are spawned per session cwd); `manifest_sections.py:41` (`persistent_session`).
- **Failing example:** The cron scan reads the History, the user buries something in Telegram, then the scan renames its copy over the file. The Tombstone is gone.
- **Fix:** Take a cross-process lock (`history.lock` opened with `O_CREAT|O_EXCL`, with a stale timeout) around each read-modify-write. fsync the temp file before the rename. Add a test with two processes.

**11. Major: "first scan" behaviour is undefined for possessed and trial traps.**
- **Where:** R5.3-R5.5, R9.2, R9.4.
- **Problem:** On the first scan every possessed charge has no match, so R5.4 reports it, but the R9.4 first-count message has no place for it. Whether first-scan trials go into `reportedTrials` is not stated.
- **Fix:** "WHEN `firstScan`, `possessed` and `trialTraps` SHALL be empty, and the scan SHALL record every current trial trap and current rise as reported."

**12. Major: an unconfigured cron fails without anyone seeing it.**
- **Where:** R9.6, R10.
- **Problem:** With `silent: true` there is no bell (`manifest_sections.py:42`). R9.6 forbids telling the user in Telegram. A cron that runs before the folder is set does nothing visible, month after month.
- **Fix:** Allow one Telegram message that carries no data, for example "The Reaper has no statements folder yet. Set it in the Crew dashboard chat."

**13. Major: two services with the same Display name cannot be told apart.**
- **Where:** R6.1, R6.4.
- **Problem:** When two Current charges share a Display name, the `candidates` list shows the same name twice, so the user can never bury either one.
- **Failing example:** Spotify at $9.99 and Spotify at $16.99 give `candidates: ["Spotify", "Spotify"]`.
- **Fix:** Make each candidate `{ name, amountText, cadence }` and accept "bury <name> <amount>". Define case folding as NFC plus `toLowerCase()`.

**14. Major: the steering corrections in R15.3 are incomplete.**
- **Where:** R15.3.
- **Problem:** The steering files have more errors than R15.3 lists, and later Kiro tasks will follow them.
- **Fix:** Also correct:
  - `tech.md`:
    - `agents[]` holds paths, not objects (`manifest.py:426`);
    - `onInstall` does not run on a local-path install, and `onUpdate` is never dispatched (`manifest_sections.py:729-737`);
    - `node_modules` is dropped from the installed copy;
    - `permissions.cron` is required;
    - `mcpTools` is enforced;
    - `ui.entry` is relative to `ui/` (`manifest_sections.py:360-364`);
    - `strict_schedule` and the random start delay.
  - `structure.md`: the tool list `draft_cancellation` should become the five tools in this spec.
  - `product.md` and `privacy.md`: replace "statements path lives in app config (setup.configSchema)" with the Settings file.

**15. Major: the scope is too large for about two days.**
- **Where:** "Scope budget".
- **Problem:** The Introduction says requirements marked **Should** may be dropped, but none are marked. There are about 150 criteria and 11 PBTs, which is closer to 25-30 tasks than 16-20. The end-to-end path (cron → scan → Telegram → bury) is not proven early.
- **Fix:**
  - Mark these as Should: R5.5 (trial traps), R5.6 (risen after burial), R6.8 `months`, the R12.3 chart (keep the table), R7.4 per-record drop (simplify to the R7.3 reset), R7.7, R13.3, R16.11, R2.7.
  - Make task 1 a walking skeleton: `app.json`, a one-tool MCP server, the agent, a cron, a local install, `cron trigger`, and a Telegram `send_message`.

**16. Minor: smaller wording, data and test gaps.**
- **R10.1:** "fires at 09:00" is wrong without `strict_schedule: true`, because Crew adds a start delay of up to 59 minutes (`manifest_sections.py:59-63`). Add `strict_schedule: true` and `persistent_session: false` (no context carried between months).
- **R6.8:** For a month with a burial but no scan, no Scan record exists. Define what that month shows (carry the previous month forward, or null). Name the time zone used for calendar months.
- **R7.3, R7.4:**
  - Define the outcome when `version` is missing, 0 or non-integer.
  - Before a write that drops records, back up the original file.
  - Create the Data dir with 0700 if it is missing.
- **R6.2:** Store `cadenceAssumed` on the Tombstone so `cancellationEmail` can be re-run (`cancel/types.ts:50-56`). R6.5: detect "already buried" with the Match rule, not by key.
- **R5.6:** Allow a grace period for posting lag, for example a charge within 3 days of `buriedAt`, to avoid false "risen" alerts.
- **R5.7:** Give the exact shape: `{ [currency]: { yearlyCostCents, guessedCount } }`.
- **R5.11:** Generators must keep one-off amounts distinct from every recurring amount and yearly cost. Otherwise the test fails on a coincidental match.
- **R13.1:**
  - Add `dns`, `tls.connect` and `child_process` (`child_process` allowed in `scripts/` only).
  - Use ESLint `no-restricted-imports` and `no-console` in `mcp/`, because grepping text misses destructured imports.
- **R13.4:** Crew may write its own files into `data/` (`bridges_agents.py:54-68`). Limit the check to files the Reaper writes.
- **R8.1:** The `model` criterion can't be tested. Omit `model`.
- **R3.1, R3.5:** The full path is passed as a tool argument, so it reaches the model provider and Crew's transcripts. Say so, and point to editing `settings.json` by hand as the private option. `folderName` can also hold a person's name.
- **Crew-side storage:** Crew stores cron results in `~/.kiro/crew/cron-history` (`cron_history.py:449`), so alert text is on disk outside the Data dir. Add that row to `privacy.md`. The beacon sends 5 fixed fields and no app data (`beacon.py:496-531`).
- **R14.4:** Name the sign convention of the demo CSV. Core's convention is positive = money out (`parse/types.ts:12`). Assert `detectedSignConvention` in the test. The README should say to keep earlier statements in the folder, since detection needs repeated charges.
- **R2 (minor risk):** A Core re-sync that changes `merchantKey` would flood new undead and orphan Tombstones. Store the Core version from `SOURCE` in the History and re-baseline when it changes.

## Questions that need a live spike in the local Crew before design

1. **Local install:** Confirm that `onInstall` is skipped, check what the installed tree contains, and whether `npm install --production` at backend start succeeds with the `file:./vendor` dependency.
2. **Node command:** Check what `command: "node"` resolves to in the materialized `~/.kiro/agents/zombills-reaper--reaper.json` and in the Crew MCP config.
3. **Folder access:** Check whether a server started by kiro-cli can read a folder under `~/Documents` (macOS privacy permission) and write `apps/zombills-reaper/data` inside the agent sandbox.
4. **Cron agent name:** Bare `reaper` or `zombills-reaper/reaper`.
5. **Tool surface:** List the agent's real tools with and without `mcpTools`, and check whether `read`, `glob` and `grep` are present.
6. **Telegram delivery:** Confirm that `send_message` with `session: "telegram"` from a silent cron run reaches the owner DM.
7. **Inbound routing:** Telegram has an `/agent` picker (`telegram/commands.py:245`, `transport_dispatch.py:1268`). Check whether it sticks to the Reaper agent for that chat, and what the user loses in their other Telegram use.
8. **Dashboard page:**
   - Check that `useAppApi().get("/api/graveyard")` reaches the backend and not Crew's own `/api/*`. The demo app calls `/api/agents` (`static/dist/apps/demo-app/ui/index.mjs`).
   - Check whether the bundle must export a `mount` function (`mountFunction` defaults to `"mount"`) or a component.
   - Check that Vite externals resolve through the host import map.
9. **Proxy secret:** Check that `.app_secret` is created on a local install.
10. **Concurrency:** Count how many MCP server processes run when the cron, a Telegram chat and a dashboard chat are active together. This decides the lock in finding 10.
11. **Run now:** Check `kirocrew cron trigger` on the app job, and the start delay with and without `strict_schedule`.

Verdict: approve after fixes

## Resolution

All 16 findings accepted. Changes are in `requirements.md`; `design.md` and `tasks.md` are not written yet.

| # | Decision | Where it changed |
| --- | --- | --- |
| 1 | Accepted with a variant: esbuild single-file bundles `mcp/dist/server.js`, `backend/dist/server.js`, `ui/dist/index.mjs` are committed, with `@zombills/core` and all libraries inlined and zero runtime `dependencies`, so a local-path install needs no `onInstall` and no `node_modules`. A CI-style test rebuilds and byte-compares the bundles; another starts them from a copy with no `node_modules`. | Introduction (findings table, "Decisions"), R1.3, R1.4, R1.8, R2.6, R2.8-R2.10, R11.1, R12.1, R13.5, R14.1, R15.5 |
| 2 | Accepted: `permissions` is exactly `{ "cron": true, "mcpTools": ["send_message"] }`, checked by the R1.8 test. | R1.6, R1.8 |
| 3 | Accepted: prompt and skill forbid reading statement files with `read`, `glob`, `grep` or any tool other than the Reaper MCP tools. `privacy.md` will say that Crew mounts built-in read tools into every agent, so this is enforced by instructions, not by Crew. The live spike lists the real tool surface. | Introduction ("Privacy"), R8.2-R8.4, R9.11, R14.1, R15.3, Open question 5 |
| 4 | Accepted: Display name is at most 80 code points (79 + "…"); R7.9 round-trips long names. | Glossary, R7.9 |
| 5 | Accepted: Match uses passes (exact id, then unique-both-ways Qualifying candidate with the `cadenceAssumed` clause, then unmatched). No tie-breakers. Blocked subscriptions are kept out of reports. Same rule for Tombstones. | Glossary ("Match", "Blocked subscription"), R5.3, R5.4, R5.6, R5.13, R16.6 |
| 6 | Accepted: `reportedRiseDate` on the Tracked charge; `increasePerYearCents = (to − from) × Cadence factor`, computed in the Reaper. | Glossary, R5.4, R5.13 |
| 7 | Accepted: R4.7 limited to ≤120 files; R4.8 excludes `files`. | R4.7, R4.8 |
| 8 | Accepted: dedupe key `(date, merchant.key, amountCents, currency)`, sorted; cross-account limit stated; `"ambiguous-dates"` skip kind. | R4.2, R4.4, Out of scope, R14.1 |
| 9 | Accepted: parse outcomes mapped to `"unknown-columns"`, `"empty"`, `"parse-error"`; `rowErrors`/`rawRow` never leave memory. | R4.2, R4.6 |
| 10 | Accepted: cross-process `history.lock` (`O_CREAT` + `O_EXCL`, stale timeout), `fsync` before rename, `"history-busy"` reason, two-process test. | R5.9, R7.6, R13.4 |
| 11 | Accepted: on the first scan `possessed` and `trialTraps` are empty and current trials and rises are recorded as reported. | R5.3 |
| 12 | Accepted: one data-free Telegram message "The Reaper has no statements folder yet. Set it in the Crew dashboard chat." | R9.6, Introduction ("Alert delivery") |
| 13 | Accepted: candidates are `{ name, amountText, cadence }`; "bury <name> <amount>" accepted; Name folding = NFC + `toLowerCase()`. | Glossary, R6.1, R6.4, R9.7 |
| 14 | Accepted: all listed `tech.md`, `structure.md`, `product.md` and `privacy.md` corrections, plus the bundle and built-in-tools notes. | R15.3 |
| 15 | Accepted with the user's split. Must: R1-R10, R13-R16 (with `unbury` excluded). Should: R11, R12, `unbury` (R6.7, R6.10). The reviewer's criterion-level Should items are marked inside Must requirements (R2.7, R5.5, R5.6, R6.8 `months`, R7.4, R7.7, R12.3 chart, R13.3, R16.11), plus R7.11. Tasks start with a walking skeleton (cron → scan → Telegram → bury). | Every requirement heading, "Scope budget" |
| 16 | Accepted, all items: `strict_schedule: true`, `persistent_session: false` (R10.1); `months` carry-forward and system time zone (R6.8); bad `version` → reset, backup before dropping records, Data dir 0700 (R7.3, R7.4, R7.8); `cadenceAssumed` on Tombstone and Match-based "already buried" (R6.2, R6.5); 3-day grace (R5.6); `yearlyTotals` shape (R5.7); distinct one-off amounts (R5.11); `dns`, `tls.connect`, `child_process`, ESLint rules (R13.1); Reaper-written files only (R13.4); no `model` (R8.1); path reaches the model provider, `settings.json` as the private option, `folderName` caveat (R3.5, R3.6); Crew `cron-history` and beacon (Introduction, R15.3); sign convention and keep earlier statements (R14.1, R14.4); `coreSource` re-baseline (R7.1, R7.11). | As listed |

The spike questions are kept in `requirements.md` as "Open questions (spike before design)", with question 1 updated for the committed bundles.
