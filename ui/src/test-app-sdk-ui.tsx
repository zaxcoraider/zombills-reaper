import { createElement as h } from "react";
import type { ReactNode } from "react";

/** Stand-ins for the host components of `@kirocrew/app-sdk/ui`. Never bundled; tests alias the module to this file. */

export function PageHeader(props: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div data-host="PageHeader">
      <div>{props.title}</div>
      {props.subtitle ? <div>{props.subtitle}</div> : null}
    </div>
  );
}

export function StatCard(props: { label: ReactNode; value: ReactNode }) {
  return (
    <div data-host="StatCard">
      <div>{props.label}</div>
      <div>{props.value}</div>
    </div>
  );
}

export function Card(props: { children?: ReactNode }) {
  return <div data-host="Card">{props.children}</div>;
}

export function CardTitle(props: { children?: ReactNode }) {
  return <h3 data-host="CardTitle">{props.children}</h3>;
}

export function EmptyState(props: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div data-host="EmptyState">
      <div>{props.title}</div>
      {props.subtitle ? <div>{props.subtitle}</div> : null}
    </div>
  );
}

export function Badge(props: { children?: ReactNode }) {
  return <span data-host="Badge">{props.children}</span>;
}
