import fc from "fast-check";
import { displayName } from "../../shared/src/display-name.ts";
import { CADENCE_FACTOR } from "../../shared/src/money.ts";
import type {
  History,
  ScanRecord,
  Tombstone,
  TrackedCharge,
  YearlyTotals,
} from "../../shared/src/types.ts";

const MAX_CENTS = 10_000_000;

const cadenceArb = fc.constantFrom("weekly" as const, "monthly" as const, "yearly" as const);
const currencyArb = fc.constantFrom("USD", "EUR", "GBP", "JPY");
const centsArb = fc.integer({ min: 0, max: MAX_CENTS });
const countArb = fc.integer({ min: 0, max: 500 });
const idArb = fc.stringMatching(/^[a-z0-9:_-]{1,24}$/u);

const dateArb = fc
  .date({ min: new Date("2001-01-01T00:00:00Z"), max: new Date("2099-12-31T23:59:59Z") })
  .filter((d) => !Number.isNaN(d.getTime()));

const localDateArb = dateArb.map((d) => d.toISOString().slice(0, 10));
const dateTimeArb = dateArb.map((d) => d.toISOString());

/** 1 to 80 code points, including exactly 80, and Display names cut from longer text. */
export const nameArb: fc.Arbitrary<string> = fc
  .oneof(
    fc.string({ unit: "grapheme", minLength: 1, maxLength: 80 }).map(displayName),
    fc.string({ unit: "grapheme-ascii", minLength: 80, maxLength: 80 }).map(displayName),
    fc.string({ unit: "grapheme", minLength: 81, maxLength: 200 }).map(displayName),
    fc.constantFrom("Netflix", "Spotify", "Gym"),
  )
  .filter((name) => name.length > 0 && [...name].length <= 80);

const yearlyTotalsArb: fc.Arbitrary<YearlyTotals> = fc
  .uniqueArray(
    fc.tuple(currencyArb, fc.record({ yearlyCostCents: centsArb, guessedCount: countArb })),
    { selector: ([currency]) => currency, maxLength: 3 },
  )
  .map((entries) => Object.fromEntries(entries));

function scanArb(scanId: string): fc.Arbitrary<ScanRecord> {
  return fc.record({
    scanId: fc.constant(scanId),
    scannedAt: dateTimeArb,
    statementRange: fc.record({ from: localDateArb, to: localDateArb }),
    undeadCount: countArb,
    yearlyTotals: yearlyTotalsArb,
    newCount: countArb,
    possessedCount: countArb,
  });
}

function trackedArb(key: string, scanIds: string[]): fc.Arbitrary<TrackedCharge> {
  const scanArbitrary = scanIds.length > 0 ? fc.constantFrom(...scanIds) : fc.constant("scan-none");
  return fc.record({
    key: fc.constant(key),
    merchant: nameArb,
    serviceId: fc.option(idArb, { nil: null }),
    currency: currencyArb,
    cadence: cadenceArb,
    merchantKey: idArb,
    amountCents: centsArb,
    cadenceAssumed: fc.boolean(),
    firstSeenScan: scanArbitrary,
    lastSeenScan: scanArbitrary,
    reportedRiseDate: fc.option(localDateArb, { nil: null }),
  });
}

function tombstoneArb(key: string): fc.Arbitrary<Tombstone> {
  return fc
    .record({
      key: fc.constant(key),
      name: nameArb,
      serviceId: fc.option(idArb, { nil: null }),
      currency: currencyArb,
      cadence: cadenceArb,
      merchantKey: idArb,
      amountCents: centsArb,
      cadenceAssumed: fc.boolean(),
      buriedAt: localDateArb,
      risenReportedThrough: fc.option(localDateArb, { nil: null }),
    })
    .map((base): Tombstone => ({
      key: base.key,
      name: base.name,
      serviceId: base.serviceId,
      currency: base.currency,
      cadence: base.cadence,
      merchantKey: base.merchantKey,
      amountCents: base.amountCents,
      cadenceAssumed: base.cadenceAssumed,
      yearlySavingCents: base.cadenceAssumed
        ? null
        : base.amountCents * CADENCE_FACTOR[base.cadence],
      buriedAt: base.buriedAt,
      risenReportedThrough: base.risenReportedThrough,
    }));
}

const keysArb = (max: number): fc.Arbitrary<string[]> => fc.uniqueArray(idArb, { maxLength: max });

/** A History that passes every codec check and stays within the limits. */
export const validHistoryArb: fc.Arbitrary<History> = fc
  .tuple(keysArb(6), keysArb(6), keysArb(6), keysArb(6))
  .chain(([scanIds, trackedKeys, tombstoneKeys, trials]) =>
    fc.record({
      version: fc.constant(1 as const),
      coreSource: fc.option(fc.stringMatching(/^[0-9a-f]{40}(-dirty)?$/u), { nil: null }),
      trackedCharges: fc.tuple(...trackedKeys.map((key) => trackedArb(key, scanIds))),
      tombstones: fc.tuple(...tombstoneKeys.map((key) => tombstoneArb(key))),
      scans: fc.tuple(...scanIds.map((id) => scanArb(id))),
      reportedTrials: fc.constant(trials),
    }),
  );

/** One record with one field broken, and the History section it belongs to. */
export interface RawRecord {
  section: "trackedCharges" | "tombstones" | "scans";
  record: Record<string, unknown>;
}

type Mutation = (record: Record<string, unknown>) => Record<string, unknown>;

const setField =
  (field: string, value: unknown): Mutation =>
  (record) => ({ ...record, [field]: value });

const dropField =
  (field: string): Mutation =>
  (record) =>
    Object.fromEntries(Object.entries(record).filter(([key]) => key !== field));

const LONG_NAME = "x".repeat(81);

const TRACKED_MUTATIONS: Mutation[] = [
  setField("key", 5),
  setField("merchant", 5),
  dropField("currency"),
  setField("amountCents", -1),
  setField("amountCents", 1.5),
  setField("cadence", "daily"),
  setField("currency", "usd"),
  setField("merchant", LONG_NAME),
  setField("merchant", ""),
  setField("reportedRiseDate", "2026-13-01"),
  setField("reportedRiseDate", "2026-02-30"),
  setField("cadenceAssumed", "yes"),
];

const TOMBSTONE_MUTATIONS: Mutation[] = [
  setField("key", null),
  setField("name", 5),
  dropField("merchantKey"),
  setField("amountCents", -5),
  setField("amountCents", "5"),
  setField("amountCents", 2.25),
  setField("cadence", "daily"),
  setField("currency", "usd"),
  setField("name", LONG_NAME),
  setField("buriedAt", "2026-13-01"),
  setField("risenReportedThrough", "2026-02-30"),
  (record) => ({
    ...record,
    yearlySavingCents:
      record["cadenceAssumed"] === true ? 100 : Number(record["yearlySavingCents"]) + 1,
  }),
];

const SCAN_MUTATIONS: Mutation[] = [
  setField("scanId", 5),
  dropField("scannedAt"),
  setField("scannedAt", "2026-13-01T00:00:00.000Z"),
  setField("statementRange", { from: "2026-13-01", to: "2026-12-01" }),
  setField("undeadCount", -1),
  setField("newCount", 1.5),
  setField("possessedCount", "2"),
  setField("yearlyTotals", { usd: { yearlyCostCents: 1, guessedCount: 0 } }),
  setField("yearlyTotals", { USD: { yearlyCostCents: -1, guessedCount: 0 } }),
];

function broken(
  section: RawRecord["section"],
  base: fc.Arbitrary<object>,
  mutations: Mutation[],
): fc.Arbitrary<RawRecord> {
  return fc.tuple(base, fc.constantFrom(...mutations)).map(([record, mutate]) => ({
    section,
    record: mutate({ ...(record as Record<string, unknown>) }),
  }));
}

export const rawRecordArb: fc.Arbitrary<RawRecord> = fc.oneof(
  broken("trackedCharges", trackedArb("broken-key", ["scan-none"]), TRACKED_MUTATIONS),
  broken("tombstones", tombstoneArb("broken-key"), TOMBSTONE_MUTATIONS),
  broken("scans", scanArb("broken-scan"), SCAN_MUTATIONS),
);

const PROTO_KEYS =
  '"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"prototype":{"polluted":"yes"}';

/**
 * JSON text of `value` with `__proto__`, `constructor` and `prototype` keys added to every
 * object except `yearlyTotals`, whose keys are currencies: a `__proto__` key there makes the
 * scan record invalid, which the codec drops.
 */
export function withPrototypeKeys(value: unknown, inject = true): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => withPrototypeKeys(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).map(
      ([key, item]) => `${JSON.stringify(key)}:${withPrototypeKeys(item, key !== "yearlyTotals")}`,
    );
    return `{${(inject ? [PROTO_KEYS, ...entries] : entries).join(",")}}`;
  }
  return JSON.stringify(value);
}

const protoJsonArb: fc.Arbitrary<string> = validHistoryArb.map((history) =>
  withPrototypeKeys(history),
);

/** Text for the totality test: JSON, plain strings and JSON with prototype keys. */
export const jsonTextArb: fc.Arbitrary<string> = fc.oneof(
  fc.json(),
  fc.string(),
  protoJsonArb,
  fc.constantFrom(
    '{"__proto__":{"polluted":"yes"}}',
    '{"version":1,"__proto__":{"polluted":"yes"},"coreSource":null,"trackedCharges":[],"tombstones":[],"scans":[],"reportedTrials":[]}',
    '{"version":1,"coreSource":null,"trackedCharges":[{"__proto__":{"polluted":"yes"}}],"tombstones":[],"scans":[],"reportedTrials":[]}',
  ),
);

// ---------------------------------------------------------------------------------------------
// Statement sets (design "Correctness properties": P1 to P4)
// ---------------------------------------------------------------------------------------------

/** One statement file as CSV text in the round-1 format, with the name it is stored under. */
export interface StatementFile {
  name: string;
  text: string;
}

/** A generated set of statement files and what a test must look for in the output. */
export interface StatementSet {
  /** Files in a random order, with random names; may hold duplicated files. */
  files: StatementFile[];
  /** Unique description markers: one-off rows (`ZQ` + digits) and processor residue digits. */
  markers: string[];
  /** Amounts of the one-off rows; none equals a recurring amount or a yearly cost. */
  oneOffAmounts: number[];
}

/** Description markers that must not show up in a Scan summary (P4). */
export function markersOf(set: StatementSet): string[] {
  return set.markers;
}

/** Amounts in integer cents of the one-off rows (P4). */
export function oneOffAmountsOf(set: StatementSet): number[] {
  return set.oneOffAmounts;
}

const KNOWN_MERCHANTS = [
  "NETFLIX.COM",
  "SPOTIFY USA",
  "DROPBOX*PLUS",
  "OPENAI *CHATGPT SUBSCR",
  "GOOGLE *YOUTUBEPREMIUM",
  "PLANET FITNESS CLUB",
];
const UNKNOWN_MERCHANTS = ["ACME BOX CLUB", "GLOBEX STREAMING", "INITECH CLOUD", "HOOLI MUSIC"];

type PriceStep = { at: number; bandRise: boolean };

interface ServiceSpec {
  /** The statement description: a pool merchant or a processor-wrapped one. */
  description: string;
  cadence: "weekly" | "monthly" | "yearly";
  baseCents: number;
  steps: PriceStep[];
  /** First charge of a trial pattern: free or low, then the full price. */
  trialCents: number | null;
  day: number;
  monthOffset: number;
}

const stepArb: fc.Arbitrary<PriceStep> = fc.record({
  at: fc.integer({ min: 1, max: 12 }),
  bandRise: fc.boolean(),
});

const baseCentsArb = fc.integer({ min: 300, max: 30_000 });
const cadenceOfServiceArb = fc.constantFrom(
  "weekly" as const,
  "monthly" as const,
  "monthly" as const,
  "yearly" as const,
);

const digitsArb = (length: number): fc.Arbitrary<string> =>
  fc.stringMatching(new RegExp(`^[1-9][0-9]{${length - 1}}$`, "u"));

const serviceBodyArb = fc.record({
  cadence: cadenceOfServiceArb,
  baseCents: baseCentsArb,
  steps: fc.array(stepArb, { maxLength: 2 }),
  trialCents: fc.option(fc.constantFrom(0, 100), { nil: null }),
  day: fc.integer({ min: 1, max: 28 }),
  monthOffset: fc.integer({ min: 0, max: 11 }),
});

/** Price of charge number `index`: each step is a Band rise (more than 5 %) or a small rise. */
function priceAt(spec: ServiceSpec, index: number): number {
  let cents = spec.baseCents;
  for (const step of [...spec.steps].sort((a, b) => a.at - b.at)) {
    if (step.at > index) break;
    cents += step.bandRise ? Math.floor(cents / 20) + 1 + (step.at % 3) : Math.floor(cents / 20);
  }
  if (spec.trialCents !== null && index === 0) return spec.trialCents;
  return cents;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Charge dates of one service inside `months` months starting 2025-01. */
function chargeDates(spec: ServiceSpec, months: number): string[] {
  const start = Date.UTC(2025, 0, 1);
  const end = Date.UTC(2025, months, 0);
  const dates: string[] = [];
  if (spec.cadence === "weekly") {
    for (let ms = start + (spec.day - 1) * 86_400_000; ms <= end; ms += 7 * 86_400_000) {
      dates.push(isoDate(ms));
    }
    return dates;
  }
  const step = spec.cadence === "monthly" ? 1 : 12;
  const first = spec.cadence === "monthly" ? 0 : spec.monthOffset;
  for (let month = first; month < months; month += step) {
    dates.push(isoDate(Date.UTC(2025, month, spec.day)));
  }
  return dates;
}

/** Cents as `12.34`, by string work only: `moneyText` is the one place that divides by 100. */
function csvAmount(cents: number): string {
  const digits = String(cents).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

interface Row {
  date: string;
  description: string;
  cents: number;
}

const serviceSpecsArb: fc.Arbitrary<ServiceSpec[]> = fc
  .tuple(
    fc.uniqueArray(fc.constantFrom(...KNOWN_MERCHANTS, ...UNKNOWN_MERCHANTS), { maxLength: 4 }),
    fc.array(fc.tuple(digitsArb(6), digitsArb(8)), { maxLength: 2 }),
  )
  .chain(([merchants, wrapped]) => {
    const descriptions = [
      ...merchants,
      ...wrapped.map(([marker, ref]) => `PAYPAL *${marker} REF ${ref}`),
    ];
    return fc.tuple(
      ...descriptions.map((description) =>
        serviceBodyArb.map((body): ServiceSpec => ({ description, ...body })),
      ),
    );
  });

const oneOffArb = fc.record({
  day: fc.integer({ min: 1, max: 28 }),
  month: fc.integer({ min: 0, max: 13 }),
  digits: digitsArb(7),
  cents: fc.integer({ min: 100, max: 200_000 }),
});

const permutationOf = <T>(items: T[]): fc.Arbitrary<T[]> =>
  fc.shuffledSubarray(items, { minLength: items.length, maxLength: items.length });

/** Statement files for 2 to 14 months: recurring services, one-off noise, shuffles, copies. */
export const statementSetArb: fc.Arbitrary<StatementSet> = fc
  .tuple(
    fc.integer({ min: 2, max: 14 }),
    serviceSpecsArb,
    fc.array(oneOffArb, { maxLength: 8 }),
    fc.integer({ min: 0, max: 2 }),
  )
  .chain(([months, services, oneOffs, copies]) => {
    const rows: Row[] = [];
    const forbidden = new Set<number>();
    for (const spec of services) {
      chargeDates(spec, months).forEach((date, index) => {
        const cents = priceAt(spec, index);
        rows.push({ date, description: spec.description, cents });
        forbidden.add(cents);
        forbidden.add(cents * CADENCE_FACTOR[spec.cadence]);
      });
    }
    const markers = new Set<string>();
    for (const spec of services) {
      for (const group of spec.description.matchAll(/\d{6,8}/gu)) markers.add(group[0]);
    }
    const oneOffAmounts: number[] = [];
    for (const [position, oneOff] of oneOffs.entries()) {
      let cents = oneOff.cents;
      while (forbidden.has(cents)) cents += 1;
      forbidden.add(cents);
      oneOffAmounts.push(cents);
      const marker = `ZQ${oneOff.digits}${position}`;
      markers.add(marker);
      const date = isoDate(Date.UTC(2025, Math.min(oneOff.month, months - 1), oneOff.day));
      rows.push({ date, description: `SHOP ${marker}`, cents });
    }

    const byMonth = new Map<string, Row[]>();
    for (const row of rows) {
      const list = byMonth.get(row.date.slice(0, 7)) ?? [];
      list.push(row);
      byMonth.set(row.date.slice(0, 7), list);
    }
    const texts = [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, list]) =>
        ["Date,Description,Amount"]
          .concat(
            list
              .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
              .map((row) => `${row.date},${row.description},${csvAmount(row.cents)}`),
          )
          .join("\n")
          .concat("\n"),
      );

    const copyCount = Math.min(copies, texts.length);
    return fc
      .shuffledSubarray(texts, { minLength: copyCount, maxLength: copyCount })
      .chain((duplicates) => permutationOf([...texts, ...duplicates]))
      .chain((all) =>
        permutationOf(all.map((_, index) => index)).map((names) => ({
          files: all.map((text, index) => ({ name: `s-${pad2(names[index] ?? 0)}.csv`, text })),
          markers: [...markers],
          oneOffAmounts,
        })),
      );
  })
  .filter((set) => set.files.length > 0);
