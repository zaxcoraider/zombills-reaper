// Cancel draft (design "Cancel draft"). Looks up only the one matched service; the cancel data
// is never listed (privacy.md).
import { cancellationEmail, getCancelHelp, mailtoHref } from "@zombills/core";
import { moneyText } from "../../shared/src/money.ts";
import type { CancelDraft, Tombstone } from "../../shared/src/types.ts";

export type CancelDraftInput = Pick<
  Tombstone,
  "name" | "serviceId" | "currency" | "cadence" | "amountCents" | "cadenceAssumed"
>;

export function cancelDraft(t: CancelDraftInput): CancelDraft {
  const help = getCancelHelp(t.serviceId, t.currency);
  if (help.kind === "link") {
    return {
      kind: "link",
      url: help.url,
      host: help.host,
      steps: [...help.steps],
      appStoreMayApply: help.appStoreMayApply,
    };
  }
  const email = cancellationEmail({
    serviceName: t.name,
    amountText: moneyText(t.amountCents, t.currency),
    currency: t.currency,
    cadence: t.cadence,
    cadenceAssumed: t.cadenceAssumed,
  });
  return { kind: "email", subject: email.subject, body: email.body, mailto: mailtoHref(email) };
}
