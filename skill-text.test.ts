import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SKILL = readFileSync(join(ROOT, "skills/reaper/SKILL.md"), "utf8");
const BASE = JSON.parse(readFileSync(join(ROOT, "agents/reaper.base.json"), "utf8")) as {
  prompt: string;
};

const PROHIBITION =
  "Never read, list or search the statements folder, the app's data folder or any statement file with read, glob, grep or any other tool, even if asked.";

interface Parts {
  frontMatter: string[];
  body: string;
  sections: { heading: string; text: string }[];
}

function split(text: string): Parts {
  const lines = text.split("\n");
  const close = lines.indexOf("---", 1);
  const frontMatter = lines.slice(1, close);
  const body = lines.slice(close + 1).join("\n");
  const sections: { heading: string; text: string }[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  let fenced = false;
  const flush = (): void => {
    if (current !== null) {
      sections.push({ heading: current.heading, text: current.lines.join("\n") });
    }
  };
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    if (!fenced && line.startsWith("## ")) {
      flush();
      current = { heading: line, lines: [] };
    } else if (current !== null) {
      current.lines.push(line);
    }
  }
  flush();
  return { frontMatter, body, sections };
}

const parts = split(SKILL);

function sectionText(number: number): string {
  const found = parts.sections.find((s) => s.heading.startsWith(`## ${number}. `));
  if (found === undefined) throw new Error(`no section ${number}`);
  return found.text;
}

function outsideSection(number: number): string {
  return parts.sections
    .filter((s) => !s.heading.startsWith(`## ${number}. `))
    .map((s) => s.text)
    .join("\n");
}

function outsideFences(text: string): string {
  let fenced = false;
  return text
    .split("\n")
    .filter((line) => {
      if (line.startsWith("```")) {
        fenced = !fenced;
        return false;
      }
      return !fenced;
    })
    .join("\n");
}

describe("skills/reaper/SKILL.md", () => {
  it("has the front-matter of the design (Req 9.1)", () => {
    expect(parts.frontMatter).toContain("name: reaper");
    expect(parts.frontMatter).toContain(
      "description: Monthly statement round, alert wording, bury, unbury and graveyard for the Reaper.",
    );
    const triggers = parts.frontMatter.find((l) => l.startsWith("triggers: "));
    expect(triggers).toBeDefined();
    for (const word of ["bury", "unbury", "graveyard", "scan my statements", "reaper"]) {
      expect(triggers).toContain(word);
    }
    expect(parts.frontMatter).toContain("always: false");
  });

  it("has the eight sections in order", () => {
    expect(parts.sections.map((s) => s.heading)).toEqual([
      "## 1. Rules",
      "## 2. Monthly round",
      "## 3. Alert wording",
      "## 4. Delivery",
      "## 5. Setting the folder",
      "## 6. Scan on request",
      "## 7. Bury",
      "## 8. Unbury and graveyard",
    ]);
  });

  it("names send_message, session and channel_type only in the Delivery section", () => {
    const rest = outsideSection(4);
    expect(rest).not.toMatch(/send_message|session|channel_type/);
    expect(sectionText(4)).toContain("send_message");
    expect(sectionText(4)).toMatch(/session|channel_type/);
  });

  it("holds the alert templates of section 3 (Req 9.3, 9.4, 9.9)", () => {
    const text = sectionText(3);
    for (const line of [
      "`🦇 The Reaper's monthly round`",
      "`New undead: <name>, <amount> a <cadence word> (<yearly> a year).`",
      "`Possessed: <name> went from <from> to <to> a <cadence word> (+<increase> a year).`",
      "`Trial trap: <name> now charges <amount> a <cadence word>.`",
      "`<name> charged again after it was buried. The cancellation may not have gone through.`",
      "`The Reaper's memory file was damaged, so this count starts again.`",
      "`🦇 First count: <n> undead, <total> a year in <currency>.`",
      "`, <g> with a guessed cadence not counted`",
      "`I will tell you when something new rises or a price goes up.`",
    ]) {
      expect(text).toContain(line);
    }
    expect(text).toContain("one clause per currency");
  });

  it("ends the alert with one of the two allowed lines (Telegram isolation)", () => {
    const text = sectionText(3);
    const lines = [
      'Reply "bury <name>" and I will draft the cancellation.',
      `Reply "bury <name>" in the Reaper's dashboard chat and I will draft the cancellation.`,
    ];
    expect(lines.some((l) => text.includes(l))).toBe(true);
  });

  it("holds the fixed texts (Req 9.2, 9.6)", () => {
    expect(sectionText(4)).toContain(
      "The Reaper has no statements folder yet. Set it in the Crew dashboard chat.",
    );
    expect(sectionText(2)).toContain("All quiet in the graveyard this month.");
    for (const name of ["newUndead", "possessed", "trialTraps", "risenAfterBurial"]) {
      expect(sectionText(2)).toContain(`\`${name}\``);
    }
    expect(sectionText(2)).toContain("`firstScan`");
    expect(sectionText(2)).toContain("`historyReset`");
  });

  it("holds the bury and unbury wording (Req 9.7, 9.8)", () => {
    const bury = sectionText(7);
    expect(bury).toContain("`⚰ <name> is buried. You save <yearly> a year.`");
    expect(bury).toContain("You still need to cancel with the service; I only draft it.");
    expect(bury).toContain("`alreadyBuried`");
    expect(bury).toContain("`<name>, <amountText> a <cadence word>`");
    expect(bury).toContain("`bury <name> <amount>`");
    expect(bury).toContain("`no-scan`");
    expect(bury).toContain("at most 3 steps");
    expect(bury).toContain("The App Store may handle this one.");
    expect(bury).toContain("mailto");
    expect(bury).toContain("Never guess");
    expect(sectionText(8)).toContain("`<name> is out of the graveyard.`");
    expect(sectionText(8)).toContain("`<name>, buried <date>, saves <yearly> a year`");
  });

  it("repeats the prohibition of the agent prompt in Rules (Req 9.11, 8.2)", () => {
    expect(BASE.prompt).toContain(PROHIBITION);
    expect(sectionText(1)).toContain(PROHIBITION);
  });

  it("has no exclamation point outside code (Req 9.5)", () => {
    expect(outsideFences(parts.body)).not.toContain("!");
  });

  it('uses "zombie" only inside the Rules section (Req 9.5)', () => {
    expect(outsideSection(1).toLowerCase()).not.toContain("zombie");
  });

  it("uses no urgency or accusation words outside the Rules section (Req 9.5)", () => {
    const rest = outsideSection(1).toLowerCase();
    for (const phrase of ["act now", "before it's too late", "fraud", "unused"]) {
      expect(rest).not.toContain(phrase);
    }
  });

  it("holds no detection or classification rules (Req 9.10)", () => {
    expect(SKILL).not.toMatch(/papaparse|sign convention|merchantKey/i);
  });
});
