# Review of `.kiro/specs/reaper/design.md`

I changed no files. `tasks.md` does not exist yet, so I reviewed the task order from design's "Task order" section. I found no blockers. The six major findings are below, and each one can be fixed in the design text.

## What I checked and found correct

- **Proxy v2.** `verifyProxyV2` follows `verify_proxy_request_v2` exactly (`kiro_crew/apps/proxy_auth.py:225-264`). It checks the nonce shape (`_is_request_id`: 32 lowercase hex), splits the header with `partition`, requires an ASCII-digit timestamp of at most 12 digits (`_MAX_TS_DIGITS`), signs the timestamp text as received, applies the ±60 s window, compares in constant time, and runs the replay check last with `expires_at = ts + 60`. `ReplayCache` matches `ProxyPrincipalReplayCache` (4096 entries, refuses when full, never evicts). The signed target is `wire_target = target_url.raw_path_qs` of `/api/{path}` (`routes_proxy.py:326-329`), and the method is `request.method` (`routes_proxy.py:366-372`). Node's `req.url` is the right value to verify against.
- **Page wiring.** The host import map provides `react`, `react-dom`, `react/jsx-runtime`, `lucide-react` and `@kirocrew/app-sdk` (`kiro_crew/static/dist/index.html`). The host React is 18 (`static/dist/vendor/react.mjs` exports `createFactory` and the old internals), so `react` 18.3.1 matches. `UIPage.route` takes the form `/apps/<name>` (`apps/manifest_sections.py:245`).
- **Data survives updates.** Install and update keep `data/` (`apps/manager_install.py:376-414`).
- **Core names.** `parseStatement`, `normalizeTransactions`, `detectSubscriptions`, `classifySubscriptions(subs, answers)`, `getCancelHelp(serviceId, currency)`, `cancellationEmail(EmailInput)`, `mailtoHref`, `EMPTY_CSV_REASON` and `NO_CONTENT_ROWS_REASON` all match the public entry point (`packages/core/src/*/index.ts`). Netflix and Paramount+ have cancel links and Planet Fitness is email-only (`cancel/cancel-data.ts:541, 611, 852-860`).

## Findings

**1. Major: a new charge that is already possessed is reported as possessed again on the next scan, so P3 fails.**
- **Where:** Scan algorithm step 11 (new Tracked charge), R5.4, R5.10, P3.
- **Problem:** The formula `reportedRiseDate = firstScan ? (latestRise?.date ?? null) : null` contradicts the sentence after it ("its rise date is recorded so it is not reported as possessed next month either").
- **Failing example:** Scan 2 finds a new Paramount+ with history 999 → 1199. It is reported as new undead, with `reportedRiseDate: null`. A re-scan of the same files matches it in pass 1, sees `latestRise` non-null and a null `reportedRiseDate`, and reports it as possessed. P3 fails.
- **Fix:** For every new Tracked charge, set `reportedRiseDate = latestRise?.date ?? null` whether or not it is a first scan.

**2. Major: only active subscriptions are matched, so leftover records block new ones for good.**
- **Where:** Scan step 6 (`active` filter), step 9 (`blocked`), R5.6, R5.13, Glossary "Blocked subscription".
- **Problem:**
  - A Tombstone or Tracked charge whose series has ended is never matched, and it is kept forever.
  - Any later active subscription with the same Triple is then blocked. A blocked subscription is never reported, never tracked, so it can never be buried, and it is never flagged as risen after burial.
- **Evidence:** `classifyOne` returns no labels for `status: "ended"` (`classify/classify-subscriptions.ts:32`). Ids discriminate only within the same Triple (`detect/ids.ts`, `assignIds`).
- **Failing examples:**
  - The user buries Netflix, cancels, and the old series ends. Later they re-subscribe at $19.99, and Core builds a new active series. The Tombstone is unmatched, so the new Netflix is blocked. No alert is sent, and in particular no risen-after-burial alert.
  - The same happens with `APPLE.COM/BILL`: an ended iCloud record blocks a new Apple Arcade.
- **Fix:**
  - Run `matchRecords` over all `detection.subscriptions` (active and ended), so ended series take their own records. Report only the active ones.
  - Only records seen in the previous scan should block (`lastSeenScan` equals the previous scan's id). Older unmatched Tracked charges should not block.
  - Amend the Glossary and R5.13 to match, and add both examples to `scan-diff.test.ts`.

**3. Major: Core ids and keys put description text in front of the model.**
- **Where:** `UndeadEntry.key`, `PossessedEntry.key`, `TrialTrapEntry.key`, `RisenEntry.key`, R5.8.
- **Problem:**
  - For an unidentified merchant, Core's Display name says only "Unknown merchant" or "<processor> payment (merchant not shown)".
  - Its key is `unidentified:<processor>:<residue>`. The residue keeps phone numbers, references, store numbers and domains (`normalize/unidentified.ts:7-9`, `normalize/clean.ts:31, 55-80`).
  - The Core id embeds that key, and the 80-code-point cap on names does not apply to it. So the tool result shows the model text that Zombills hides on purpose. For generic merchants, `merchant:<slug>` repeats the merchant name without the cap.
- **Failing example:** A recurring charge `PAYPAL *4029357733 REF 88812` gets Display name "PayPal payment (merchant not shown)". Its `key`, sent in the Scan summary, holds `4029357733 ref 88812`.
- **Fix:**
  - Leave `key` out of every tool result. The agent never needs it, because `bury` resolves by name.
  - If an id is needed, return `ref`: the first 12 hex characters of sha256 of the key.
  - Keep `key` and `merchantKey` in the History only, which stays on the machine.
  - Amend R5.8 ("a Core id or key") and add an unidentified-residue case to P4.

**4. Major: Crew runs `npm install` on the root `package.json` when the backend starts, and design ignores it.**
- **Where:** "Build and bundles", R1.4, R2.6.
- **Problem:**
  - Crew runs `npm install --production --no-audit --no-fund` in every directory between the backend entry point and the app root that has a `package.json` and no `node_modules`. That includes the root (`apps/backend.py:958-998`).
  - Without a committed `package-lock.json`, npm may fetch registry metadata for the dev tree.
  - A root `prepare`, `preinstall`, `install` or `postinstall` script would run at backend start.
  - The spike's throwaway app did not show this path.
- **Fix:**
  - Commit `package-lock.json`.
  - Forbid lifecycle scripts in the root `package.json`, checked in `app-manifest.test.ts`.
  - In skeleton task 2, read `gateway.log` for "Installing npm deps" and check the exit code is 0 and the backend is healthy.

**5. Major: design leaves out the Crew and kiro-cli transcripts on disk.**
- **Where:** "Privacy enforcement", "Steering corrections" (`privacy.md`).
- **Problem:**
  - kiro-cli stores chat transcripts in `<kiro home>/sessions/cli/<sid>.jsonl` (`kiro_crew/config/paths.py:1268`, `kiro_sessions_dir`).
  - Crew keeps its own under `data_home()/sessions` (`history_files.py:27`, `session_digest.py:58`).
  - These hold every Scan summary, every bury draft and the full path passed to `set_statements_folder`. The design lists only `cron-history`.
- **Fix:** Add both stores to the `privacy.md` correction and to the README privacy text, as a limit on "summaries only".

**6. Major: some tasks are too big for one small Kiro run, and the safety checks come too late.**
- **Where:** "Task order".
- **Problems:**
  - Task 2 holds the manifest, agent, skill, MCP server, bundle, install, enable and five manual Telegram checks.
  - Task 7 holds matching, the diff, the full scan and P1 to P6 and P11.
  - The ESLint `no-console` and network rules (task 14) and the freshness and bundle-start tests (task 15) arrive after the skeleton already depends on the bundles.
  - The skeleton has to scan something, but the demo fixtures only arrive in task 11.
  - No task creates `mcp/fixtures/generators.ts`.
- **Fix:**
  - Split task 2 into "2a manifest, agent, skill, minimal MCP, bundle start test" and "2b install, trigger, T1, T2, T3, T7, T8".
  - Split task 7 into "match.ts + P6" and "scan-diff + scan_statements + P1 to P5, P11".
  - Move the ESLint rules and `build-fresh.test.ts` into task 1.
  - Move the round-1 demo CSVs into task 2.
  - Put the generators in task 6.
  - Have the skeleton's interim History use the final `version: 1` shape, so task 5 does not reset it.

**7. Minor: a first scan, a re-baseline or a reset can lose a risen-after-burial alert.**
- **Where:** Skill section 3, scan step 10.
- **Problem:** Risen-after-burial items are reported even when `firstScan` is true, but the "First count" template replaces the round template. The item is then marked as reported and never shown. Which template applies when `historyReset` is true is also not stated.
- **Fix:** The first-count message adds the risen lines and the reset line when they are present.

**8. Minor: the risen line puts a date in Telegram.**
- **Where:** Skill section 3, R9.3, `privacy.md` channel row.
- **Problem:** `<name> charged again on <lastChargeDate>…` adds a transaction date to Telegram. R9.3 and `privacy.md` do not allow it.
- **Fix:** Drop the date, or amend R9.3 and `privacy.md`.

**9. Minor: the amount suffix swallows names that end in a number.**
- **Where:** `resolve-service.ts` step 2.
- **Failing example:** "bury Xbox 360" becomes name "Xbox" plus amount $360.00, so the result is `not-found`.
- **Fix:** Resolve the whole text as a name first, and split off an amount only when that finds nothing.

**10. Minor: some Core field names are wrong.**
- **Where:** Scan steps 6, 9 and 11.
- **Problem:**
  - `s.cadenceAssumed` does not exist. The field is `s.evidence.cadenceAssumed` (`detect/types.ts`, `DetectionEvidence`).
  - `statement.firstDate` and `statement.lastDate` are `string | null`.
- **Fix:** Correct the field names. Map a null range to `"no-statements"`.

**11. Minor: design changes requirements that have not been amended.**
- **Problem:** These design choices disagree with the current requirements:
  - The page imports `moneyText`, but R15.2 says `ui/` imports types only.
  - The new `internal-error` reason is not in R5.9.
  - The new `Tombstone.merchantKey` field is not in R6.2 or R7.1.
  - `historyReset` is returned by `bury` and `unbury`, but R7.3 only puts it in the next Scan summary.
- **Fix:** Add "Amended by design" notes to each of these criteria.

**12. Minor: the dependency list and the JSX reason need fixing.**
- **Problems:**
  - `@testing-library/react` needs `react-dom` and `@testing-library/dom` as dev dependencies.
  - The `@modelcontextprotocol/sdk` and `zod` versions are not pinned.
  - Check that the pinned SDK's `registerTool` accepts a `.strict()` `ZodObject`.
  - The import map does provide `react/jsx-runtime`. The classic transform still works, but the reason given for it is wrong.
- **Fix:** Add and pin the missing packages, and correct the JSX reason.

**13. Minor: some tests are not runnable or may be flaky as written.**
- **Problems:**
  - Node's type stripping does not map `.js` specifiers to `.ts` files, so the two-process children cannot run `mcp/src` directly.
  - `scripts/*.ts` imported as `.ts` need `allowImportingTsExtensions`.
  - The lock tests use real timers.
- **Fix:** Run the two-process test against the MCP bundle over stdio. Inject a clock into `withHistoryLock`.

**14. Minor: the Tracked charge limit has no direction.**
- **Where:** Codec step 7, R7.7.
- **Problem:** "First 1,000 Tracked charges by `lastSeenScan` order" does not say newest or oldest. A `lastSeenScan` whose scan was trimmed has no order.
- **Fix:** Keep the 1,000 with the newest `lastSeenScan`, and order missing scans as oldest.

**15. Minor: a local `data/` folder in the repo gets copied on the first install.**
- **Where:** README, `app-manifest.test.ts`.
- **Problem:** On a first install Crew keeps the source's own `data/` (`apps/manager_install.py:385`). A dev `data/settings.json` holding a real path would ship into the installed copy.
- **Fix:** Have the install step in the README refuse when `<repo>/data` exists, or warn about it.

**16. Minor: skill loading and the Telegram fallbacks are not verified.**
- **Problems:**
  - Crew splits `triggers` on commas as a plain string (`trigger_match.py:76`). The YAML list `[bury, …]` works only by accident, and nobody has confirmed that the skill loads for the cron message.
  - If T4 fails, the alert's last line "Reply \"bury <name>\"" misleads Telegram users.
- **Fix:** Use `triggers: bury, unbury, graveyard, scan my statements, reaper, monthly round`. Confirm the skill loads in skeleton task 2. Add the alert's last line to the "Telegram isolation" table.

**17. Minor: the backend sandbox and the bundles are not checked.**
- **Problems:**
  - The spike showed the MCP server can read and write `data/` (Q3). It did not show that the sandboxed backend can read it (`sandbox_tiers.py:232`).
  - The source scan does not cover the bundles. papaparse inlines `XMLHttpRequest` code.
- **Fix:** Add "the backend reads `data/history.json`" to the skeleton checks. Add a bundle text scan with a named allowlist for papaparse's streamer.

Verdict: approve after fixes

## Resolution

All 17 findings accepted with the suggested fixes. Changes are in `design.md` unless noted; requirement changes carry an "Amended by design review 1 #N" note in `requirements.md`.

| # | Resolution | Requirements amended |
| --- | --- | --- |
| 1 | Scan step 11: every new Tracked charge gets `reportedRiseDate = latestRise?.date ?? null`, first scan or not. `scan-diff.test.ts` gains the already-possessed-when-new case | R5.13 |
| 2 | Step 6 keeps `subs` (active and ended); step 9 matches over `subs`; only active subscriptions are reported or blocked. A Tracked charge blocks only when `lastSeenScan` is the previous scan; a Tombstone only when pass 2 left it unmatched by ambiguity. A pair with an ended series only updates `key`. "Why the reported sets cannot flood" and `scan-diff.test.ts` gain the Netflix and `APPLE.COM/BILL` examples | Glossary "Blocked subscription", R5.13 |
| 3 | `key` replaced by `ref` (12 hex of sha256, `shared/src/ref.ts`) in all four entry types; new `TombstoneView` (no `key`, no `merchantKey`) for `bury`, `list_graveyard` and the backend. P4 gains the unidentified-residue case and a check that no `key`, `merchantKey` or `id` field appears | R5.8 (covers R5.2, 5.4–5.6, 6.2, 6.8, 5.11) |
| 4 | `package-lock.json` committed; no lifecycle scripts in the root `package.json`, checked by `app-manifest.test.ts`; task 2b reads `gateway.log` for "Installing npm deps", exit code 0 and a healthy backend | R2.6 |
| 5 | "Steering corrections" names kiro-cli's `sessions/cli/<sid>.jsonl` and Crew's `data_home()/sessions` for `privacy.md` and the README privacy text | R15.3, R14.1 |
| 6 | Task order rewritten: ESLint privacy rules and `build-fresh.test.ts` in task 1; task 2 split into 2a (manifest, agent, skill, minimal MCP, bundle start test, round-1 demo CSVs) and 2b (install, trigger, skeleton checks, T1, T2, T3, T7, T8); matching (7) split from scan diff and tool (8); generators in task 6; interim History in the final `version: 1` shape | none |
| 7 | Skill section 3: the first-count message also holds the risen lines and the reset line; a first scan after a reset uses that template | none |
| 8 | Date dropped from the risen line | none |
| 9 | `resolve-service.ts` step 2: whole text as a name first, amount split only on `none` | R6.1 |
| 10 | `s.evidence.cadenceAssumed` in steps 9, 10, 11 and the `bury` pseudo-subscription; a null statement range maps to `"no-statements"` | none |
| 11 | Notes added for `moneyText` in `ui/`, `internal-error`, `Tombstone.merchantKey` and `historyReset` in `bury`/`unbury` results | R15.2, R5.9, R6.2, R7.1, R7.3 |
| 12 | `react-dom` 18.3.1 and `@testing-library/dom` added; SDK and `zod` marked exact pins; task 1 checks `registerTool` with a `.strict()` `ZodObject`; JSX and page-import reasons corrected. The exact SDK, `zod` and `@testing-library/dom` versions are chosen and locked in task 1, because they could not be checked during this edit | none |
| 13 | Two-process test runs two MCP bundles over stdio; `allowImportingTsExtensions` for `scripts/`; `withHistoryLock` takes an injected `LockClock` | none |
| 14 | Codec step 7 keeps the 1,000 Tracked charges with the newest `lastSeenScan`; a missing scan ranks oldest | none |
| 15 | README install step checks `<repo>/data` is absent; `app-manifest.test.ts` fails when `data/` is tracked | R14.1 |
| 16 | `triggers` is a comma string; task 2a confirms the skill loads; the alert's last line is a row in "Telegram isolation" with its T4 fallback | none |
| 17 | Task 2b checks the backend stub reads `data/history.json`; new `scripts/privacy-bundle.test.ts` scans the committed bundles with a named allowlist starting with papaparse's `NetworkStreamer` | none |
