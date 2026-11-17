import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const TOKEN_SHAPE = /\d{6,}:[A-Za-z0-9_-]{30,}/;
const LIFECYCLE_SCRIPTS = [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "preprepare",
  "postprepare",
  "prepublish",
  "prepack",
  "postpack",
];
const CRON_HOME = "$HOME/.kiro/crew/apps/zombills-reaper/";

type Json = Record<string, unknown>;

function readJson(path: string): Json {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as Json;
}

function gitFiles(args: string[]): string[] {
  const out = execFileSync("git", ["ls-files", ...args], { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter((line) => line !== "");
}

function isCommitted(path: string): boolean {
  return gitFiles(["--cached", "--others", "--exclude-standard", "--", path]).length > 0;
}

const app = readJson("app.json");
const agent = readJson("agents/reaper.json");
const pkg = readJson("package.json");

describe("app.json", () => {
  it("has name, version, displayName and a one-sentence description (Req 1.1)", () => {
    expect(app["name"]).toBe("zombills-reaper");
    expect(app["version"]).toBe("0.1.0");
    expect(String(app["version"])).toMatch(SEMVER);
    expect(app["displayName"]).toBe("The Reaper");
    const description = String(app["description"]);
    expect(description.length).toBeGreaterThan(0);
    expect(description.match(/[.!?]/g)).toHaveLength(1);
    expect(description.endsWith(".")).toBe(true);
  });

  it("declares the stdio MCP server exactly as designed (Req 1.2)", () => {
    expect(app["mcpServers"]).toEqual({
      reaper: {
        command: "/bin/sh",
        args: ["-c", 'exec node "$HOME/.kiro/crew/apps/zombills-reaper/mcp/dist/server.js"'],
      },
    });
  });

  it("declares agents, skills, backend and ui exactly as designed (Req 1.3, 12.1)", () => {
    expect(app["agents"]).toEqual(["agents/reaper.json"]);
    expect(app["skills"]).toEqual(["skills/reaper"]);
    expect(app["backend"]).toEqual({
      entryPoint: "backend/dist/server.js",
      type: "node",
      port: "auto",
      healthCheck: "/api/health",
    });
    expect(app["ui"]).toEqual({
      entry: "dist/index.mjs",
      pages: [{ route: "/apps/zombills-reaper", label: "Graveyard", icon: "Skull" }],
    });
  });

  it("has no setup.onInstall (Req 1.4)", () => {
    const setup = app["setup"] as Json;
    expect(setup).toBeDefined();
    expect(setup).not.toHaveProperty("onInstall");
  });

  it("has a configSchema with one required string statementsFolder (Req 1.5)", () => {
    const schema = (app["setup"] as Json)["configSchema"] as Json;
    expect(schema["type"]).toBe("object");
    expect(schema["required"]).toEqual(["statementsFolder"]);
    const properties = schema["properties"] as Record<string, Json>;
    expect(Object.keys(properties)).toEqual(["statementsFolder"]);
    const folder = properties["statementsFolder"] as Json;
    expect(folder["type"]).toBe("string");
    const description = String(folder["description"]);
    expect(description).toContain("read in place");
    expect(description).toContain("Reaper agent");
    expect(description).toContain("data/settings.json");
  });

  it("declares the exact permissions (Req 1.6)", () => {
    expect(app["permissions"]).toEqual({
      cron: true,
      mcpTools: ["send_message"],
      api: ["/apps/zombills-reaper/api"],
    });
  });

  it("holds no home path, ${HOME} or token-like string (Req 1.7)", () => {
    const text = JSON.stringify(app);
    expect(text).not.toContain("/Users/");
    expect(text).not.toContain("${HOME}");
    expect(text).not.toMatch(TOKEN_SHAPE);
  });

  it("has the one monthly cron (Req 10.1, 10.2, 10.4)", () => {
    const crons = app["crons"] as Json[];
    expect(crons).toHaveLength(1);
    const cron = crons[0] as Json;
    expect(cron).toEqual({
      name: "monthly-scan",
      cron_expr: "0 9 1 * *",
      agent: "reaper",
      message: "Run the monthly round of the reaper skill.",
      silent: true,
      strict_schedule: true,
      persistent_session: false,
      enabled: true,
    });
    expect(cron).not.toHaveProperty("timezone");
    expect(String(cron["message"])).not.toMatch(/[/\d$]/);
  });
});

describe("agents/reaper.json", () => {
  it("lists exactly the two tool groups and no model (Req 8.1, 8.4)", () => {
    expect(agent["tools"]).toEqual(["@kirocrew-core", "@zombills-reaper:reaper"]);
    expect([
      ["@zombills-reaper:reaper"],
      ["@zombills-reaper:reaper", "@kirocrew-core/send_message"],
    ]).toContainEqual(agent["allowedTools"]);
    expect(agent).not.toHaveProperty("model");
  });
});

describe("committed files (Req 1.8)", () => {
  function mcpScriptPath(): string {
    const args = ((app["mcpServers"] as Record<string, Json>)["reaper"] as Json)[
      "args"
    ] as string[];
    const command = String(args[1]);
    const match = /exec node "([^"]+)"/.exec(command);
    expect(match).not.toBeNull();
    const quoted = (match as RegExpExecArray)[1] as string;
    expect(quoted.startsWith(CRON_HOME)).toBe(true);
    return quoted.replace(CRON_HOME, "");
  }

  it("commits every file the manifest names", () => {
    const files = [
      "agents/reaper.json",
      "skills/reaper/SKILL.md",
      "ui/dist/index.mjs",
      "backend/dist/server.js",
      mcpScriptPath(),
    ];
    for (const file of files) {
      expect(isCommitted(file), `${file} is not committed`).toBe(true);
    }
  });
});

describe("root package.json and lock file (Req 2.6)", () => {
  it("has no runtime dependencies", () => {
    const dependencies = pkg["dependencies"] as Json | undefined;
    expect(dependencies === undefined || Object.keys(dependencies).length === 0).toBe(true);
  });

  it("has no lifecycle scripts", () => {
    const scripts = pkg["scripts"] as Json;
    for (const name of LIFECYCLE_SCRIPTS) {
      expect(scripts).not.toHaveProperty(name);
    }
  });

  it("commits package-lock.json", () => {
    expect(isCommitted("package-lock.json")).toBe(true);
  });

  it("tracks nothing under data/", () => {
    expect(gitFiles(["--cached", "--", "data"])).toEqual([]);
  });
});
