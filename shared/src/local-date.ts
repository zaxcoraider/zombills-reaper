/** `yyyy-mm-dd` of an instant in the given IANA time zone. */
export function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** `yyyy-mm` of an instant (a `Date` or an ISO date-time) in the given IANA time zone. */
export function localMonth(iso: Date | string, timeZone: string): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return localDate(date, timeZone).slice(0, 7);
}
