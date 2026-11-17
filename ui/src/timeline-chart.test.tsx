import { createElement as h } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { GraveyardMonth } from "../../shared/src/types.ts";
import { moneyText } from "../../shared/src/money.ts";
import { TimelineChart } from "./timeline-chart.tsx";

afterEach(cleanup);

function month(
  name: string,
  cost: number | null,
  saved: number | null,
  undead: number | null = 2,
): GraveyardMonth {
  return {
    month: name,
    undeadCount: cost === null ? null : undead,
    yearlyTotals: cost === null ? null : { USD: { yearlyCostCents: cost, guessedCount: 0 } },
    buriedCount: 0,
    cumulativeSavings: saved === null ? {} : { USD: { yearlySavingCents: saved, guessedCount: 0 } },
  };
}

function names(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
}

function draw(months: GraveyardMonth[]) {
  const { container } = render(<TimelineChart months={months} />);
  const svg = container.querySelector("svg") as SVGSVGElement;
  const bars = Array.from(svg.querySelectorAll("rect"));
  const texts = (selector: string) =>
    Array.from(svg.querySelectorAll(selector)).map((t) => t.textContent);
  return { container, svg, bars, texts };
}

describe("TimelineChart", () => {
  it("draws one month as two narrow bars in a box sized to its content", () => {
    const { container, svg, bars, texts } = draw([month("2026-02", 30000, 18588)]);
    expect(svg.getAttribute("width")).toBe(String(72 + 72 + 16));
    expect(svg.getAttribute("width")).not.toBe("100%");
    expect(svg.getAttribute("viewBox")).toBe(
      `0 0 ${svg.getAttribute("width")} ${svg.getAttribute("height")}`,
    );
    expect(svg.getAttribute("height")).toBe(String(72 + 160 + 28 + 44));
    expect(bars.length).toBe(2);
    for (const bar of bars) {
      expect(bar.getAttribute("width")).toBe("22");
      expect(Number(bar.getAttribute("width"))).toBeLessThanOrEqual(72);
    }
    expect(texts("text[data-month]")).toEqual(["2026-02"]);
    expect(texts("text[data-value]")).toEqual(["$300.00", "$185.88"]);
    const all = texts("text");
    expect(all).toContain("$0.00");
    expect(all.filter((t) => t === "$300.00").length).toBe(2);
    for (const bar of bars) {
      const fill = bar.getAttribute("fill") ?? "";
      expect(fill.startsWith("var(--")).toBe(true);
      expect(fill.endsWith(", currentColor)")).toBe(true);
    }
    expect((container.firstElementChild as HTMLElement).style.overflowX).toBe("auto");
  });

  it("draws twelve months with a gap for a month without a scan", () => {
    const months = names(12).map((name, i) =>
      month(name, i === 6 ? null : 10000 + i * 5000, i >= 3 ? (i - 2) * 4000 : null),
    );
    const { svg, bars, texts } = draw(months);
    expect(svg.getAttribute("width")).toBe(String(72 + 12 * 72 + 16));
    for (const bar of bars) expect(bar.getAttribute("width")).toBe("22");
    expect(svg.querySelectorAll('rect[data-bar="cost"]').length).toBe(11);
    expect(svg.querySelectorAll('rect[data-bar="saved"]').length).toBe(9);
    expect(texts("text[data-month]")).toEqual(names(12));
    const rows = months.map((m) => [
      ...(m.yearlyTotals ? [moneyText(m.yearlyTotals.USD?.yearlyCostCents ?? 0, "USD")] : []),
      ...(m.cumulativeSavings.USD
        ? [moneyText(m.cumulativeSavings.USD.yearlySavingCents, "USD")]
        : []),
    ]);
    const tableMoney = new Set(rows.flat());
    const labels = texts("text[data-value]");
    expect(labels.length).toBe(20);
    for (const label of labels) expect(tableMoney.has(label ?? "")).toBe(true);
  });

  it("draws twenty-four months", () => {
    const months = names(24).map((_, i) =>
      month(
        `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
        5000 + i,
        null,
      ),
    );
    const { svg, bars, texts } = draw(months);
    expect(svg.getAttribute("width")).toBe(String(72 + 24 * 72 + 16));
    expect(texts("text[data-month]").length).toBe(24);
    expect(bars.length).toBe(24);
    for (const bar of bars) expect(bar.getAttribute("width")).toBe("22");
  });

  it("scales bar heights to the tallest value and writes the legend", () => {
    const { svg, texts } = draw([month("2026-02", 30000, 15000)]);
    const heights = Array.from(svg.querySelectorAll("rect")).map((r) => r.getAttribute("height"));
    expect(heights).toEqual(["160", "80"]);
    expect(texts("text[data-legend]")).toEqual(["Yearly cost (USD)", "Saved so far (USD)"]);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws nothing when no month has a cost", () => {
    const { container } = render(<TimelineChart months={[month("2026-02", null, null)]} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
