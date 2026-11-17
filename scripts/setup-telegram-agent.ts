// Writes ~/.kiro/agents/reaper-chat.json, a user-level copy of the Reaper agent for Telegram's /agent picker.
// Dev/setup script only: it never runs at Crew runtime. It reads and writes local files and makes no network call.
// Crew hides app-installed agents (file name contains "--") from the picker, so the copy needs its own name.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const SOURCE_FILE = "zombills-reaper--reaper.json";
export const TARGET_FILE = "reaper-chat.json";
export const CHAT_NAME = "reaper-chat";
export const CHAT_DESCRIPTION = "The Reaper (Zombills): bury, unbury and graveyard from chat.";

export const TELEGRAM_NOTE =
  "This copy of the Reaper answers in Telegram. Every conversation here is a Telegram conversation.";

const COPIED_FIELDS = ["prompt", "tools", "allowedTools", "mcpServers"] as const;

export type SetupResult = { path: string; created: boolean };

type AgentFile = Record<string, unknown>;

function parseObject(text: string, label: string): AgentFile {
  // JSON.parse returns any; the value is checked to be a plain object before use.
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not a JSON object`);
  }
  return value as AgentFile;
}

/** Builds the reaper-chat agent text from the installed app agent text. */
export function buildChatAgent(sourceText: string): string {
  const source = parseObject(sourceText, SOURCE_FILE);
  const agent: AgentFile = { name: CHAT_NAME, description: CHAT_DESCRIPTION };
  for (const field of COPIED_FIELDS) {
    if (source[field] === undefined) throw new Error(`${SOURCE_FILE} has no ${field}`);
    agent[field] = source[field];
  }
  if (typeof agent["prompt"] !== "string") throw new Error(`${SOURCE_FILE} prompt is not text`);
  agent["prompt"] = `${agent["prompt"]}\n\n${TELEGRAM_NOTE}`;
  return JSON.stringify(agent, null, 2) + "\n";
}

/** A file is ours when it is a reaper-chat agent with the description this script writes. */
function isOurs(text: string): boolean {
  try {
    const existing = parseObject(text, TARGET_FILE);
    return existing["name"] === CHAT_NAME && existing["description"] === CHAT_DESCRIPTION;
  } catch {
    return false;
  }
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Writes the reaper-chat agent under `home`. Refuses to replace a file it did not create unless `force`. */
export async function setupTelegramAgent({
  home = homedir(),
  force = false,
}: { home?: string; force?: boolean } = {}): Promise<SetupResult> {
  const agentsDir = join(home, ".kiro", "agents");
  const sourcePath = join(agentsDir, SOURCE_FILE);
  const targetPath = join(agentsDir, TARGET_FILE);

  const sourceText = await readIfExists(sourcePath);
  if (sourceText === undefined) {
    throw new Error(`${sourcePath} not found. Install and enable the app in Crew first.`);
  }
  const text = buildChatAgent(sourceText);

  const existing = await readIfExists(targetPath);
  if (existing !== undefined && !force && !isOurs(existing)) {
    throw new Error(
      `${targetPath} exists and was not created by this script. Use --force to replace it.`,
    );
  }

  await mkdir(agentsDir, { recursive: true });
  await writeFile(targetPath, text, { mode: 0o600 });
  await chmod(targetPath, 0o600);
  return { path: targetPath, created: existing === undefined };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== "--force");
  if (unknown.length > 0) {
    console.error(
      `Unknown argument: ${unknown.join(" ")}. Usage: npm run setup:telegram [-- --force]`,
    );
    process.exitCode = 2;
    return;
  }
  try {
    const result = await setupTelegramAgent({ force: args.includes("--force") });
    console.log(`${result.created ? "Wrote" : "Updated"} ${result.path}`);
    console.log("In Telegram, send /agent and pick reaper-chat.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
