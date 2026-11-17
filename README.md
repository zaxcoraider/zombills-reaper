# The Reaper

Your bank statement is haunted, and the Reaper checks it every month so new zombies never get comfortable.

The Reaper is a [Kiro Crew](https://kiro.dev/docs/crew) app (tested on Crew 0.12.2) and the companion to Zombills. Once a month it reads a folder of bank statement CSVs on your own machine, runs the Zombills detection code on them, compares the result with the last scan, and tells you in chat about new undead (recurring charges it has not seen before) and possessed charges (price rises). Reply "bury Netflix" and it drafts the cancellation: the cancel link when Zombills knows the service, otherwise a cancellation email. A Graveyard page in the Crew dashboard shows each month's undead, what you buried and the yearly saving.

## Privacy

Your statements are read in place on the machine that runs Crew and are never copied or uploaded. Parsed rows live only in the memory of the Reaper's MCP server during a scan, and every tool returns summaries only: recurring charges, price changes and tombstones, never rows, balances, account numbers or one-off purchases. The Reaper's own code makes no network request, and the only messages that leave your machine are the summaries Crew sends to your chat channel and to the model provider that runs the agent.

Limits of that promise:

- Crew mounts its built-in `read`, `glob` and `grep` tools into every agent and the Reaper cannot remove them. Only the agent prompt and the skill keep the agent away from your statement files. They are instructions, and Crew does not enforce them.
- A folder path you give to the agent is a tool argument, so it reaches the model provider. To keep the path on your machine, edit `data/settings.json` in the app folder yourself (see "The statements folder").
- Crew keeps the text of every alert in `~/.kiro/crew/cron-history`.
- Two transcript stores on disk hold every scan summary, every bury draft and any path passed to the agent: kiro-cli's `<kiro home>/sessions/cli/<sid>.jsonl` and Crew's `data_home()/sessions`. They stay on your machine, but they sit outside the Reaper's data folder and the Reaper does not manage them. "Summaries only" limits what reaches them, not whether they exist.

## Install on your Mac

1. Install Crew 0.12.2.
2. Check that `<repo>/data` does not exist in your clone. A first install copies the source's `data/` into the installed app, so a development `data/settings.json` would travel with it. Move it out of the repo if it exists.
3. Run `kirocrew app install <repo path>`.
4. Enable the app in the Crew dashboard: Apps → Library → The Reaper → Enable. The CLI refuses to enable third-party apps. Never set `agent.apps_allow_third_party` to get around that.
5. Set your timezone in Crew. The monthly cron fires at 09:00 on the 1st in Crew's zone, then UTC.

The three bundles (`mcp/dist/server.js`, `backend/dist/server.js`, `ui/dist/index.mjs`) are committed and need no build. After you change source, run `npm ci && npm run build`, then `kirocrew app update zombills-reaper`. If you ever rename the cron in `app.json`, `kirocrew app update` adds the new job and keeps the old one, so remove the old one with `kirocrew cron remove <id>`.

## Telegram

1. In the Crew dashboard open Settings → Messaging Channels and connect your Telegram bot. The bot token lives in Crew only, never in this repo.
2. In the chat with your bot, send `/agent reaper`. Later messages in that chat go to the Reaper agent, so "bury Netflix" works there. (Not yet tested on Telegram.)
3. While the chat is routed to the Reaper, you talk to the Reaper and not to Crew's default agent. To switch back, send `/agent` with no name or with another agent's name. (Not yet tested on Telegram.)
4. If routing does not work for you, use the Reaper agent's chat in the Crew dashboard instead. It understands the same commands.

The agent's tool surface is `send_message` from `@kirocrew-core` and the five Reaper tools: `scan_statements`, `list_graveyard`, `bury`, `unbury` and `set_statements_folder`. Crew also mounts `read`, `glob` and `grep` (see "Privacy"). (Not yet tested on Telegram.)

## The statements folder

Tell the Reaper agent in the dashboard chat which folder to watch, for example "watch the folder at ~/Documents/statements". The agent calls `set_statements_folder` and answers with the folder's last name and the number of statement files it found.

To keep the path off the model provider, edit `data/settings.json` in the installed app folder (`~/.kiro/crew/apps/zombills-reaper/data/settings.json`) yourself instead. Crew 0.12.2 does not pass `setup.configSchema` values to apps, so the manifest only documents the setting.

Keep earlier statements in the folder, because detection needs repeated charges. The same charge on two accounts on the same day counts once.

## Run it now

1. `kirocrew cron list` and find the id of `zombills-reaper/Graveyard watch`.
2. `kirocrew cron trigger <id>`. A run takes about 8 to 40 seconds.

Or send "scan my statements" to the Reaper agent in the dashboard chat. That runs the same scan and replies in that chat only, without sending anything to Telegram.

## Demo

The folder `mcp/fixtures/demo/` holds fake statements.

1. Copy `mcp/fixtures/demo/round-1/*.csv` into a new folder outside the repo and set it as the statements folder.
2. Run the cron now. The first count is 6 undead, $1,181.40 a year in USD.
3. Copy `mcp/fixtures/demo/round-2/*.csv` into the same folder and run it again. The alert names one new undead (Paramount+) and one possessed charge (Netflix, $15.49 to $17.99 a month).
4. Reply `bury Netflix` for a cancel link, and `bury Planet Fitness` for a cancellation email with a `mailto:` link.

## What the Reaper never does

- It never cancels a service for you, logs in to one, or opens a link.
- It never sends an email for you. It drafts the text and you send it.
- It never uploads your statements, and it links no bank account.

## Troubleshooting

The Reaper's tools do not show up in the agent:

- The MCP server starts with `node`. If kiro-cli cannot find `node` on the PATH it inherits from Crew, the server never starts. Make sure `node` (22.18 or later) is on the PATH of the shell that starts Crew.
- Crew looks for apps in `~/.kiro/crew`. If you set a `KIROCREW_HOME` other than that, the launch command in `app.json`, which points at `$HOME/.kiro/crew/apps/zombills-reaper`, does not find the server.

## Later: your own EC2 instance

`kirocrew cloud` runs Crew on your own AWS EC2 instance. The same app and the same rules apply: the statements folder and the Reaper's data folder live on that instance, which you own. Do not add S3, log shipping of app data or any other service that moves statement data off the instance.

## License

MIT. See `LICENSE`.
