import { createElement as h, useEffect, useRef, useState } from "react";
import { useAppApi } from "@kirocrew/app-sdk";
import { isGraveyardResponse } from "./graveyard-response.ts";
import type { GraveyardReply } from "./graveyard-response.ts";
import { PAGE_TEXT } from "./page-text.ts";
import { SavingsHeadline } from "./savings-headline.tsx";
import { TimelineChart } from "./timeline-chart.tsx";
import { TimelineTable } from "./timeline-table.tsx";
import { TombstoneList } from "./tombstone-list.tsx";

const GRAVEYARD_PATH = "/apps/zombills-reaper/api/graveyard";

type PageState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; reply: Extract<GraveyardReply, { ok: true }> };

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
      <div style={{ padding: "1rem" }}>
        <p>{PAGE_TEXT.error}</p>
        <button type="button" onClick={retry}>
          {PAGE_TEXT.retry}
        </button>
      </div>
    );
  }
  const { reply } = state;
  const isEmpty = reply.tombstones.length === 0 && reply.lastScan === null;
  return (
    <div style={{ padding: "1rem" }}>
      <SavingsHeadline data={reply} headingRef={heading} />
      {isEmpty ? <p>{PAGE_TEXT.empty}</p> : null}
      {reply.months.length > 0 ? (
        <section>
          <TimelineChart months={reply.months} />
          <TimelineTable months={reply.months} />
        </section>
      ) : null}
      <TombstoneList tombstones={reply.tombstones} />
    </div>
  );
}
