import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildChatAgent,
  CHAT_DESCRIPTION,
  setupTelegramAgent,
  SOURCE_FILE,
  TARGET_FILE,
  TELEGRAM_NOTE,
} from "./setup-telegram-agent.ts";

const SOURCE = {
  name: "reaper",
  description: "app description",
  prompt: "prompt text",
  tools: ["@kirocrew-core", "@zombills-reaper:reaper"],
  allowedTools: ["@zombills-reaper:reaper", "@kirocrew-core/send_message"],
  mcpServers: { "zombills-reaper:reaper": { command: "/bin/sh", args: ["-c", "exec node x"] } },
  managedToolPolicy: { exclude: ["wait"] },
  permissions: { rules: [] },
  kiroUpgrade: { revision: 3 },
};

let home: string;
let agentsDir: string;

async function readTarget(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(agentsDir, TARGET_FILE), "utf8")) as Record<
    string,
    unknown
  >;
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "reaper-setup-"));
  agentsDir = join(home, ".kiro", "agents");
  await mkdir(agentsDir, { recursive: true });
  await writeFile(join(agentsDir, SOURCE_FILE), JSON.stringify(SOURCE));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("setupTelegramAgent", () => {
  it("writes the copy with the new name and description and no managedToolPolicy", async () => {
    const result = await setupTelegramAgent({ home });
    expect(result).toEqual({ path: join(agentsDir, TARGET_FILE), created: true });
    const agent = await readTarget();
    expect(agent).toEqual({
      name: "reaper-chat",
      description: CHAT_DESCRIPTION,
      prompt: `${SOURCE.prompt}\n\n${TELEGRAM_NOTE}`,
      tools: SOURCE.tools,
      allowedTools: SOURCE.allowedTools,
      mcpServers: SOURCE.mcpServers,
    });
    expect(agent).not.toHaveProperty("managedToolPolicy");
  });

  it("writes the file with mode 0600", async () => {
    await setupTelegramAgent({ home });
    expect((await stat(join(agentsDir, TARGET_FILE))).mode & 0o777).toBe(0o600);
  });

  it("replaces its own file when run again", async () => {
    await setupTelegramAgent({ home });
    await writeFile(join(agentsDir, SOURCE_FILE), JSON.stringify({ ...SOURCE, prompt: "newer" }));
    const result = await setupTelegramAgent({ home });
    expect(result.created).toBe(false);
    expect((await readTarget())["prompt"]).toBe(`newer\n\n${TELEGRAM_NOTE}`);
    expect(String((await readTarget())["prompt"]).split(TELEGRAM_NOTE)).toHaveLength(2);
  });

  it("holds no exclamation point in the Telegram note", () => {
    expect(TELEGRAM_NOTE).not.toContain("!");
  });

  it("refuses to overwrite a file it did not create", async () => {
    const target = join(agentsDir, TARGET_FILE);
    await writeFile(target, JSON.stringify({ name: "reaper-chat", description: "mine" }));
    await expect(setupTelegramAgent({ home })).rejects.toThrow(/--force/);
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({
      name: "reaper-chat",
      description: "mine",
    });
  });

  it("refuses to overwrite a file that is not JSON, and replaces it with force", async () => {
    const target = join(agentsDir, TARGET_FILE);
    await writeFile(target, "not json");
    await expect(setupTelegramAgent({ home })).rejects.toThrow(/--force/);
    await setupTelegramAgent({ home, force: true });
    expect((await readTarget())["name"]).toBe("reaper-chat");
  });

  it("fails clearly when the app agent is not installed", async () => {
    await rm(join(agentsDir, SOURCE_FILE));
    await expect(setupTelegramAgent({ home })).rejects.toThrow(/not found/);
  });
});

describe("buildChatAgent", () => {
  it("rejects a source without a required field", () => {
    expect(() => buildChatAgent(JSON.stringify({ prompt: "p" }))).toThrow(/no tools/);
  });
});
