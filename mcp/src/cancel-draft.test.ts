import { describe, expect, it } from "vitest";
import { cancelDraft } from "./cancel-draft.js";

const BASE = {
  currency: "USD",
  cadence: "monthly",
  cadenceAssumed: false,
} as const;

describe("cancelDraft", () => {
  it("gives a link for Netflix", () => {
    const draft = cancelDraft({
      ...BASE,
      name: "Netflix",
      serviceId: "netflix",
      amountCents: 1549,
    });
    expect(draft.kind).toBe("link");
    if (draft.kind !== "link") return;
    expect(draft.url.length).toBeGreaterThan(0);
    expect(draft.host.length).toBeGreaterThan(0);
    expect(Array.isArray(draft.steps)).toBe(true);
    expect(typeof draft.appStoreMayApply).toBe("boolean");
  });

  it("gives an email for Planet Fitness with the amount in the body", () => {
    const draft = cancelDraft({
      ...BASE,
      name: "Planet Fitness Club",
      serviceId: "planet-fitness",
      amountCents: 2499,
    });
    expect(draft.kind).toBe("email");
    if (draft.kind !== "email") return;
    expect(draft.mailto.startsWith("mailto:")).toBe(true);
    expect(draft.body).toContain("$24.99");
  });

  it("gives an email when the serviceId is null", () => {
    const draft = cancelDraft({
      ...BASE,
      name: "Some Local Club",
      serviceId: null,
      amountCents: 999,
    });
    expect(draft.kind).toBe("email");
  });
});
