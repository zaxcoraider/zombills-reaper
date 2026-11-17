---
inclusion: always
---

# Product

## What we build

**The Reaper** is a Kiro Crew app (Kiro Crew 0.12.2) and the companion to **Zombills**, the browser-only web app that finds zombie subscriptions in a bank statement CSV. Zombills lives in its own repo (local path `/Users/zax/Projects/Kiroween-Hackathon`). This repo is https://github.com/zaxcoraider/zombills-reaper (public, MIT). The Reaper keeps the problem fixed month after month: it watches a folder of statements on the user's own machine, tells the user in chat when something new is draining their money, and drafts the cancellation when they reply "bury".

## One-sentence pitch

> "Your bank statement is haunted, and the Reaper checks it every month so new zombies never get comfortable."

## How it works

1. **Monthly cron.** A `crons[]` entry in `app.json` fires once a month. Crew crons can only send a prompt to an agent; they cannot run a script or hit an endpoint. So the cron sends a message to the **Reaper agent**.
2. **Reaper agent scans.** The agent calls tools on the Reaper's own stdio MCP server (declared under `mcpServers` in `app.json`). The scan tool reads the statements folder the user chose, stored in the Settings file `data/settings.json` (`setup.configSchema` values do not reach apps in Crew 0.12.2; the user sets the folder by telling the Reaper agent, which calls `set_statements_folder`, or by editing the file), runs `@zombills/core` (parse → normalise → detect → classify) on every statement, and compares the result with the previous scan stored in the app data directory.
3. **Alert.** If the scan finds a **new undead** (a recurring charge not seen in earlier scans) or a **possessed** charge (price rise), the agent sends a short summary to the user's Crew channel. For the demo the channel is **Telegram**. The channel and its bot token are configured in Crew by the user; the Reaper repo never contains a token.
4. **"Bury" reply.** When the user replies "bury <service>", the agent calls the `bury` tool, which records a Tombstone and drafts the cancellation. In Telegram, replies reach the Reaper agent through `/agent reaper` in the bot chat (pending Telegram test T4; the fallback is the Reaper's dashboard chat tab). It returns the cancel URL from the Zombills cancel-helper database if the service is listed, otherwise a cancellation email built by the Zombills email template generator. The Reaper drafts only. It never logs into a service or sends the email for the user.
5. **Dashboard page.** A Crew dashboard page (`ui.pages`) shows the graveyard over time: each month's undead, what was buried, and the running yearly saving. It reads its data from the Reaper backend.

## Vocabulary (same as Zombills)

| Term | Meaning |
| --- | --- |
| Undead | Any detected recurring charge |
| Zombie | An undead the user says they no longer use. A statement cannot show usage, so only the user makes something a zombie |
| Possessed | A recurring charge whose price went up |
| Trial trap | First paid charge after a free or low-price period |
| Buried | The user chose to cancel it |
| Tombstone | Record of a burial with its yearly saving |
| Graveyard | The savings history |

Alerts say "new undead" or "possessed", never "zombie", unless the user has already called it one.

## Hosting

- **Now: the user's local Mac.** Crew runs on the Mac, the statements folder is on the Mac, and the Reaper runs inside that Crew install.
- **Later: the user's own AWS EC2 instance** via `kirocrew cloud`. Same app, same rules. The statements folder then lives on that instance, which the user owns. No shared or third-party hosting.

## Scope

### Must have

- Monthly cron → Reaper agent → MCP scan of the statements folder.
- Telegram alert (through Crew) for new undead and possessed charges.
- "Bury" reply → drafted cancellation (cancel URL or email).
- Dashboard page with the graveyard over time.

### Won't have

- Bank-account linking (Plaid etc.). Privacy is a feature, as in Zombills.
- Cancelling on the user's behalf or sending emails for them.
- Any Reaper-run server outside the machine running Crew.
- Its own copy of the detection logic. All parsing, detection, classification and cancel data come from `@zombills/core`.
