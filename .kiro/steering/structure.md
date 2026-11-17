---
inclusion: always
---

# Repo Structure

## Layout

```
/
├── app.json               # Crew manifest: crons, agents, mcpServers, ui, backend, setup, permissions
├── agents/                # Reaper agent definitions (JSON) referenced by app.json agents[]
├── skills/                # one folder per skill, each with SKILL.md
├── mcp/                   # stdio MCP server: scan-statements, draft-cancellation tools
│   └── src/
├── backend/               # Node backend for the dashboard page (proxied at /apps/{name}/api/*)
│   └── src/
├── ui/                    # dashboard page, Vite lib build → ESM bundle for ui.entry
│   └── src/
├── vendor/
│   └── zombills-core/     # built copy of @zombills/core (dist/, package.json, SOURCE)
├── scripts/               # sync-core and other dev scripts
├── .kiro/
│   └── steering/          # this directory
├── LICENSE                # MIT
├── README.md
└── .gitignore
```

`.kiro/` is **never gitignored**; it is evidence of Kiro usage for the hackathon. `vendor/` is committed, because Crew installs by cloning this repo and cannot reach the Zombills repo.

## Folder responsibilities

| Folder | Owns | Must not |
| --- | --- | --- |
| `app.json` | The single manifest Crew reads | Contain secrets, tokens or a hard-coded statements path |
| `agents/` | Reaper agent prompt, model, tool list | Grant tools the agent does not use |
| `skills/` | Instructions for scan, alert wording, "bury" handling | Duplicate detection logic |
| `mcp/` | MCP tools that call `@zombills/core` and read/write scan history | Make network requests |
| `backend/` | Read-only graveyard API for the dashboard; verifies `X-Crew-Proxy` | Expose raw statement rows |
| `ui/` | Dashboard page (graveyard over time) | Bundle host-provided externals or read files directly |
| `vendor/` | Synced build of `@zombills/core` | Be edited by hand |
| `scripts/` | `sync-core`, build helpers | Run at Crew runtime |

Shared Reaper types (scan result, tombstone, history record) live in one module imported by `mcp/`, `backend/` and `ui/`, so the three never drift. Where it sits is decided in the Reaper spec.

## Naming conventions

Same as Zombills:

- **Files:** `kebab-case` (`scan-statements.ts`, `graveyard-timeline.tsx`).
- **Components:** PascalCase exports (`GraveyardTimeline`).
- **Hooks:** `use` prefix, camelCase.
- **Types / interfaces:** PascalCase, no `I` prefix.
- **Constants:** `SCREAMING_SNAKE_CASE` at module level.
- **MCP tool names:** `snake_case` (`scan_statements`, `draft_cancellation`).

## Where tests live

| Test kind | Location | File suffix |
| --- | --- | --- |
| Unit tests | Co-located with the source file | `.test.ts` / `.test.tsx` |
| Property-based tests | Co-located with the source file | `.property.test.ts` |
| Fixtures | `mcp/fixtures/`: fake, anonymised CSVs only | `.csv` |

Never commit a real bank statement, not even in a fixture or a gitignored folder inside the repo.
