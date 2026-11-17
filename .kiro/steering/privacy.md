---
inclusion: always
---

# Privacy

## Core guarantee

**Statement data never leaves the machine running Crew.** Today that is the user's Mac; later it is the user's own EC2 instance. This is the Reaper's version of the Zombills promise ("statement data never leaves the browser"). Only summaries leave the machine, by two paths, and Crew handles both of them: the user's own Crew channel, and the model provider Crew uses to run the Reaper agent (see the table below). The Reaper's own code makes no external requests.

## Where data goes

| Data | Where it may exist |
| --- | --- |
| Statement files (CSV/PDF) | The statements folder on the machine running Crew. Read in place; never copied, moved or uploaded |
| Parsed transactions (every row) | Memory of the MCP server process during a scan. Never written to disk, never returned from a tool |
| Scan history (recurring charges: merchant, cadence, amount in cents, dates; burials and savings) | JSON in the app data directory on the same machine |
| MCP tool results | The Reaper agent's context. The agent's model runs through Crew, so tool results reach the model provider Crew is configured with. Tools therefore return **summaries only**: recurring charges and price changes, never raw rows, balances, account numbers or descriptions of one-off purchases |
| Chat alerts and drafts | The user's Crew channel (Telegram for the demo). Telegram is a third party, so messages carry only: service name, old and new price, cadence, yearly cost, and the drafted cancel link or email |
| Dashboard data | Served by the Reaper backend to the Crew dashboard on the same machine, behind the `X-Crew-Proxy` HMAC check |

## Service names

- The Reaper only names a service that appears in the user's own statements. It never suggests, lists or guesses services the user does not have.
- The cancel-helper database in `@zombills/core` is looked up by the merchant found in the statement. It is never sent, listed or summarised as a whole.
- Names are shown as text only, no logos (same rule as Zombills).

## What this means in code

- **No network calls** from `mcp/`, `backend/`, `ui/` or `scripts/` runtime code: no `fetch`, `http.request` to a remote host, `XMLHttpRequest`, WebSocket, `navigator.sendBeacon`, or SDK that does any of these. The backend only listens on the port Crew assigns. The only outbound path is the Crew channel, and Crew sends it, not the Reaper.
- `scripts/sync-core` reads the Zombills repo on the local disk. It downloads nothing.
- **No telemetry**: no analytics, crash reporting, usage pings or remote error trackers.
- **No secrets in this repo**: no Telegram bot token, chat ID, API key or real statements path. Channel setup lives in Crew; the statements path lives in app config (`setup.configSchema`).
- **Logs** never contain transaction rows, amounts tied to merchants, file contents or full statement paths. Log counts and error kinds only.
- **Dashboard** loads no fonts, images or scripts from a CDN or any external host. Bundle what it needs or use host-provided packages.
- `vendor/zombills-core` keeps the Zombills rule: no network calls inside core. A network call there is a bug to fix in Zombills, not here.

## What is explicitly forbidden

| Forbidden | Why |
| --- | --- |
| Sending statement files or parsed rows to any URL, including the chat channel | Breaks the core guarantee |
| Returning raw rows from an MCP tool | They would reach the model provider |
| Committing a real statement or a bot token | Leaks private data or credentials through a public repo |
| Adding an analytics or error-tracking SDK | Could leak merchant names or amounts |
| Naming a service the user's statements do not contain | Leaks nothing useful and misleads the user |
| Copying statements into the repo, the app data directory or a cloud bucket | Statements are read in place only |

## Hosting on EC2

On the user's own EC2 instance (via `kirocrew cloud`) the same rules hold: the instance is "the machine running Crew". The statements folder and app data stay on that instance. Do not add S3, CloudWatch log shipping of app data, or any other AWS service that would move statement data off the instance.

## Enforcement

Any outbound network call in this repo's runtime code is a bug, not a configuration choice. Review every new dependency for network behaviour before adding it.
