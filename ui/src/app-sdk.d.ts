declare module "@kirocrew/app-sdk" {
  export function useAppApi(): { get(path: string): Promise<unknown> };
}

// Host components (Crew 0.12.2 `vendor/kirocrew-ui.mjs`). Only the props the page passes are declared.
declare module "@kirocrew/app-sdk/ui" {
  import type { CSSProperties, ReactNode } from "react";

  export function PageHeader(props: { title: ReactNode; subtitle?: ReactNode }): ReactNode;
  export function StatCard(props: {
    label: ReactNode;
    value: ReactNode;
    className?: string;
  }): ReactNode;
  export function Card(props: {
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
  }): ReactNode;
  export function CardTitle(props: { children?: ReactNode; className?: string }): ReactNode;
  export function EmptyState(props: { title: ReactNode; subtitle?: ReactNode }): ReactNode;
  export function Badge(props: {
    children?: ReactNode;
    variant?: "ok" | "err" | "aim" | "muted" | "warn";
  }): ReactNode;
}
