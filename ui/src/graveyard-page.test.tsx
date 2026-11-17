import { createElement as h } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraveyardPage } from "./graveyard-page.tsx";

const get = vi.fn<(path: string) => Promise<unknown>>();

vi.mock("@kirocrew/app-sdk", () => ({ useAppApi: () => ({ get }) }));

const DATA = {
  ok: true,
  tombstones: [
    {
      ref: "abc123",
      name: "Netflix",
      serviceId: "netflix",
      currency: "USD",
      cadence: "monthly",
      amountCents: 1549,
      cadenceAssumed: false,
      yearlySavingCents: 18588,
      buriedAt: "2026-02-03",
      risenReportedThrough: null,
    },
  ],
  savings: { USD: { yearlySavingCents: 18588, guessedCount: 0 } },
  months: [],
  lastScan: null,
};

const BASE_TOMBSTONE = DATA.tombstones[0];

const FULL = {
  ok: true,
  tombstones: [
    BASE_TOMBSTONE,
    {
      ...BASE_TOMBSTONE,
      ref: "def456",
      name: "Gym",
      currency: "GBP",
      amountCents: 2500,
      yearlySavingCents: null,
      cadenceAssumed: true,
      buriedAt: "2026-04-10",
    },
    {
      ...BASE_TOMBSTONE,
      ref: "ghi789",
      name: "Cloud",
      currency: "GBP",
      cadence: "yearly",
      amountCents: 4000,
      yearlySavingCents: 4000,
      buriedAt: "2026-03-01",
    },
  ],
  savings: {
    GBP: { yearlySavingCents: 4000, guessedCount: 1 },
    USD: { yearlySavingCents: 18588, guessedCount: 0 },
  },
  months: [
    {
      month: "2026-02",
      undeadCount: 3,
      yearlyTotals: {
        GBP: { yearlyCostCents: 8000, guessedCount: 0 },
        USD: { yearlyCostCents: 30000, guessedCount: 0 },
      },
      buriedCount: 1,
      cumulativeSavings: { USD: { yearlySavingCents: 18588, guessedCount: 0 } },
    },
    {
      month: "2026-03",
      undeadCount: null,
      yearlyTotals: null,
      buriedCount: 0,
      cumulativeSavings: {},
    },
  ],
  lastScan: {
    scannedAt: "2026-04-12T12:00:00Z",
    statementRange: { from: "2026-01-01", to: "2026-03-31" },
    undeadCount: 3,
    yearlyTotals: { USD: { yearlyCostCents: 30000, guessedCount: 0 } },
  },
};

const EMPTY = { ok: true, tombstones: [], savings: {}, months: [], lastScan: null };

beforeEach(() => {
  get.mockReset();
});

afterEach(cleanup);

describe("GraveyardPage", () => {
  it("shows the loading text in a status region and asks for the exact path", async () => {
    get.mockReturnValue(new Promise(() => {}));
    render(<GraveyardPage />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Reading the graveyard…");
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/apps/zombills-reaper/api/graveyard");
  });

  it("shows the error state when get rejects, and retry shows the data and focuses the heading", async () => {
    get.mockRejectedValueOnce(new Error("boom"));
    get.mockResolvedValueOnce(DATA);
    render(<GraveyardPage />);
    expect(await screen.findByText("The graveyard could not be read.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "The graveyard" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("shows the error state for a reply that fails the guard", async () => {
    get.mockResolvedValue({ ok: true, tombstones: "none" });
    render(<GraveyardPage />);
    expect(await screen.findByText("The graveyard could not be read.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows the error state for ok: false", async () => {
    get.mockResolvedValue({ ok: false, reason: "history-unreadable" });
    render(<GraveyardPage />);
    expect(await screen.findByText("The graveyard could not be read.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows the empty sentence for an empty reply", async () => {
    get.mockResolvedValue(EMPTY);
    render(<GraveyardPage />);
    expect(
      await screen.findByText(
        "Nothing buried yet. The Reaper checks your statements on the 1st of each month.",
      ),
    ).toBeTruthy();
  });

  it("shows the data heading for a reply with a Tombstone", async () => {
    get.mockResolvedValue(DATA);
    render(<GraveyardPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "The graveyard" })).toBeTruthy();
    expect(screen.queryByText(/Nothing buried yet\. The Reaper/)).toBeNull();
  });

  it("shows one headline line per currency and a table row with two money values", async () => {
    get.mockResolvedValue(FULL);
    const { container } = render(<GraveyardPage />);
    await screen.findByRole("heading", { level: 1, name: "The graveyard" });
    expect(screen.getByText("You save $185.88 a year")).toBeTruthy();
    expect(screen.getByText("You save £40.00 a year")).toBeTruthy();
    expect(screen.getByText("1 saving not counted (cadence guessed)")).toBeTruthy();
    expect(container.textContent).toContain(
      "Last checked 2026-04-12, statements 2026-01-01 to 2026-03-31.".replace(
        "2026-04-12",
        new Intl.DateTimeFormat("en-CA", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date("2026-04-12T12:00:00Z")),
      ),
    );
    expect(container.querySelector("caption")?.textContent).toBe("Month by month");
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain("£80.00, $300.00");
    expect(rows[1]?.textContent).toContain("—");
  });

  it("marks a guessed-cadence Tombstone as not counted", async () => {
    get.mockResolvedValue(FULL);
    render(<GraveyardPage />);
    await screen.findByRole("heading", { level: 1, name: "The graveyard" });
    const items = screen.getAllByRole("listitem");
    const gym = items.find((li) => li.textContent?.includes("Gym"));
    expect(gym?.textContent).toContain("saving not counted (cadence guessed)");
    expect(gym?.textContent).not.toContain("saves");
    expect(screen.queryByText("You save £65.00 a year")).toBeNull();
  });

  it("lists Tombstones newest first with amount, saving and date", async () => {
    get.mockResolvedValue(FULL);
    render(<GraveyardPage />);
    await screen.findByRole("heading", { level: 1, name: "The graveyard" });
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items.map((t) => t.split(":")[0])).toEqual(["Gym", "Cloud", "Netflix"]);
    expect(items[2]).toBe("Netflix: $15.49 a month, saves $185.88 a year, buried 2026-02-03");
    expect(items[1]).toContain("£40.00 a year");
  });

  it("shows the chart only with the table, and hides the chart from assistive tech", async () => {
    get.mockResolvedValue(FULL);
    const { container } = render(<GraveyardPage />);
    await screen.findByRole("heading", { level: 1, name: "The graveyard" });
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelector("text")).toBeNull();
    expect(container.querySelector("table")).not.toBeNull();
  });

  it("says nothing is buried yet, with the last scan, when there are scans but no Tombstones", async () => {
    get.mockResolvedValue({ ...FULL, tombstones: [], savings: {}, months: [] });
    render(<GraveyardPage />);
    expect(await screen.findByText("Nothing buried yet.")).toBeTruthy();
    expect(screen.getByText(/^Last checked /)).toBeTruthy();
  });

  it("uses only native buttons, reachable by Tab", async () => {
    get.mockRejectedValue(new Error("boom"));
    const { container } = render(<GraveyardPage />);
    await screen.findByText("The graveyard could not be read.");
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBe(1);
    for (const button of buttons) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    }
    expect(container.querySelectorAll('[role="button"]').length).toBe(0);
  });
});
