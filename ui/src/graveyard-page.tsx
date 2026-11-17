import { createElement as h, useEffect, useRef, useState } from "react";
import { useAppApi } from "@kirocrew/app-sdk";
import { Card, CardTitle, PageHeader } from "@kirocrew/app-sdk/ui";
import { localDate } from "../../shared/src/local-date.ts";
import { isGraveyardResponse } from "./graveyard-response.ts";
import type { GraveyardReply } from "./graveyard-response.ts";
import { PAGE_TEXT } from "./page-text.ts";
import { SavingsHeadline } from "./savings-headline.tsx";
import { StatRow } from "./stat-row.tsx";
import { TimelineChart } from "./timeline-chart.tsx";
import { TimelineTable } from "./timeline-table.tsx";
import { TombstoneList } from "./tombstone-list.tsx";

const GRAVEYARD_PATH = "/apps/zombills-reaper/api/graveyard";

type PageState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; reply: Extract<GraveyardReply, { ok: true }> };

function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function GraveyardPage() {
  const api = useAppApi();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const afterRetry = useRef(false);
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    let current = true;
    apiRef.current
      .get(GRAVEYARD_PATH)
      .then((reply) => {
        if (!current) return;
        setState(
          isGraveyardResponse(reply) && reply.ok ? { kind: "ready", reply } : { kind: "error" },
        );
      })
      .catch(() => {
        if (current) setState({ kind: "error" });
      });
    return () => {
      current = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (state.kind === "ready" && afterRetry.current) {
      afterRetry.current = false;
      heading.current?.focus();
    }
  }, [state]);

  function retry() {
    afterRetry.current = true;
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }

  if (state.kind === "loading") {
    return (
      <div role="status" style={{ padding: "1rem" }}>
        {PAGE_TEXT.loading}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <Card>
        <p>{PAGE_TEXT.error}</p>
        <button type="button" onClick={retry}>
          {PAGE_TEXT.retry}
        </button>
      </Card>
    );
  }
  const { reply } = state;
  const { lastScan } = reply;
  return (
    <div style={{ padding: "1rem" }}>
      <PageHeader
        title={
          <h1
            ref={heading}
            tabIndex={-1}
            style={{ margin: 0, font: "inherit", letterSpacing: "inherit" }}
          >
            {PAGE_TEXT.heading}
          </h1>
        }
        subtitle={
          lastScan === null
            ? undefined
            : PAGE_TEXT.lastChecked(
                localDate(new Date(lastScan.scannedAt), browserZone()),
                lastScan.statementRange.from,
                lastScan.statementRange.to,
              )
        }
      />
      <StatRow data={reply} />
      <SavingsHeadline data={reply} />
      {reply.months.length > 0 ? (
        <Card>
          <CardTitle>{PAGE_TEXT.tableCaption}</CardTitle>
          <TimelineChart months={reply.months} />
          <TimelineTable months={reply.months} />
        </Card>
      ) : null}
      <TombstoneList tombstones={reply.tombstones} />
    </div>
  );
}
