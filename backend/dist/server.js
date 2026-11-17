// backend/src/server.ts
import { createServer } from "node:http";
import { join as join2 } from "node:path";

// backend/src/env.ts
var MAX_PORT = 65535;
function readBackendEnv(env2) {
  const rawPort = env2["PORT"];
  if (typeof rawPort !== "string" || !/^[1-9][0-9]{0,4}$/.test(rawPort)) {
    return { ok: false, bad: "PORT" };
  }
  const port = Number(rawPort);
  if (port > MAX_PORT) return { ok: false, bad: "PORT" };
  const secret = env2["KIROCREW_PROXY_SECRET"];
  if (typeof secret !== "string" || secret === "") {
    return { ok: false, bad: "KIROCREW_PROXY_SECRET" };
  }
  return { ok: true, port, secret };
}

// backend/src/replay-cache.ts
var ReplayCache = class {
  maxEntries = 4096;
  seen = /* @__PURE__ */ new Map();
  accept(nonce, expiresAt, now) {
    for (const [key, expiry] of this.seen) {
      if (expiry < now) this.seen.delete(key);
    }
    if (this.seen.has(nonce) || this.seen.size >= this.maxEntries) return false;
    this.seen.set(nonce, expiresAt);
    return true;
  }
};

// backend/src/routes.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// shared/src/local-date.ts
function localDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}
function localMonth(iso, timeZone) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return localDate(date, timeZone).slice(0, 7);
}

// shared/src/ref.ts
import { createHash } from "node:crypto";
function refOf(key) {
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 12);
}

// shared/src/graveyard-summary.ts
function compareText(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
function compareTombstones(a, b) {
  return compareText(b.buriedAt, a.buriedAt) || compareText(a.name, b.name) || compareText(a.key, b.key);
}
function viewOf(tombstone) {
  const view = { ...tombstone };
  delete view.key;
  delete view.merchantKey;
  return { ...view, ref: refOf(tombstone.key) };
}
function savingsOf(tombstones) {
  const byCurrency = /* @__PURE__ */ new Map();
  for (const t of tombstones) {
    const entry = byCurrency.get(t.currency) ?? { yearlySavingCents: 0, guessedCount: 0 };
    if (t.yearlySavingCents === null) entry.guessedCount += 1;
    else entry.yearlySavingCents += t.yearlySavingCents;
    byCurrency.set(t.currency, entry);
  }
  return Object.fromEntries(byCurrency);
}
function graveyardView(history, timeZone) {
  const sorted = [...history.tombstones].sort(compareTombstones);
  const lastScanOfMonth = /* @__PURE__ */ new Map();
  for (const scan of history.scans) {
    lastScanOfMonth.set(localMonth(scan.scannedAt, timeZone), {
      undeadCount: scan.undeadCount,
      yearlyTotals: scan.yearlyTotals
    });
  }
  const monthSet = new Set(lastScanOfMonth.keys());
  for (const t of history.tombstones) monthSet.add(t.buriedAt.slice(0, 7));
  let carried = null;
  const months = [];
  for (const month of [...monthSet].sort(compareText)) {
    carried = lastScanOfMonth.get(month) ?? carried;
    const buried = history.tombstones.filter((t) => t.buriedAt.slice(0, 7) <= month);
    months.push({
      month,
      undeadCount: carried ? carried.undeadCount : null,
      yearlyTotals: carried ? carried.yearlyTotals : null,
      buriedCount: buried.length,
      cumulativeSavings: savingsOf(buried)
    });
  }
  return { tombstones: sorted.map(viewOf), savings: savingsOf(history.tombstones), months };
}

// shared/src/money.ts
var CADENCE_FACTOR = { weekly: 52, monthly: 12, yearly: 1 };

// shared/src/history-codec.ts
var LIMITS = { scans: 36, trackedCharges: 1e3, tombstones: 1e3, reportedTrials: 1e3 };
var MAX_NAME_CODE_POINTS = 80;
var MAX_CORE_SOURCE_LENGTH = 64;
var CURRENCY = /^[A-Z]{3}$/u;
var DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
var DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/u;
function emptyHistory() {
  return {
    version: 1,
    coreSource: null,
    trackedCharges: [],
    tombstones: [],
    scans: [],
    reportedTrials: []
  };
}
function isPlain(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function own(object, key) {
  return Object.hasOwn(object, key) ? object[key] : void 0;
}
function isCents(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isLeap(year) {
  return year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
}
function isRealDate(value) {
  if (typeof value !== "string") return false;
  const match = DATE.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const days = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}
function isIsoDateTime(value) {
  if (typeof value !== "string") return false;
  const match = DATE_TIME.exec(value);
  if (match === null || !isRealDate(match[1])) return false;
  return Number(match[2]) < 24 && Number(match[3]) < 60 && Number(match[4]) < 60;
}
function isCadence(value) {
  return value === "weekly" || value === "monthly" || value === "yearly";
}
function isCurrency(value) {
  return typeof value === "string" && CURRENCY.test(value);
}
function isName(value) {
  return typeof value === "string" && value.length > 0 && [...value].length <= MAX_NAME_CODE_POINTS;
}
function isText(value) {
  return typeof value === "string" && value.length > 0;
}
function isNullOr(value, check) {
  return value === null || check(value);
}
function readYearlyTotals(value) {
  if (!isPlain(value)) return null;
  const result = {};
  for (const currency of Object.keys(value)) {
    if (!CURRENCY.test(currency)) return null;
    const entry = value[currency];
    if (!isPlain(entry)) return null;
    const yearlyCostCents = own(entry, "yearlyCostCents");
    const guessedCount = own(entry, "guessedCount");
    if (!isCents(yearlyCostCents) || !isCents(guessedCount)) return null;
    result[currency] = { yearlyCostCents, guessedCount };
  }
  return result;
}
function readTrackedCharge(raw) {
  if (!isPlain(raw)) return null;
  const key = own(raw, "key");
  const merchant = own(raw, "merchant");
  const serviceId = own(raw, "serviceId");
  const currency = own(raw, "currency");
  const cadence = own(raw, "cadence");
  const merchantKey = own(raw, "merchantKey");
  const amountCents = own(raw, "amountCents");
  const cadenceAssumed = own(raw, "cadenceAssumed");
  const firstSeenScan = own(raw, "firstSeenScan");
  const lastSeenScan = own(raw, "lastSeenScan");
  const reportedRiseDate = own(raw, "reportedRiseDate");
  if (!isText(key) || !isName(merchant) || !isNullOr(serviceId, isText) || !isCurrency(currency) || !isCadence(cadence) || typeof merchantKey !== "string" || !isCents(amountCents) || typeof cadenceAssumed !== "boolean" || typeof firstSeenScan !== "string" || typeof lastSeenScan !== "string" || !isNullOr(reportedRiseDate, isRealDate)) {
    return null;
  }
  return {
    key,
    merchant,
    serviceId,
    currency,
    cadence,
    merchantKey,
    amountCents,
    cadenceAssumed,
    firstSeenScan,
    lastSeenScan,
    reportedRiseDate
  };
}
function readTombstone(raw) {
  if (!isPlain(raw)) return null;
  const key = own(raw, "key");
  const name = own(raw, "name");
  const serviceId = own(raw, "serviceId");
  const currency = own(raw, "currency");
  const cadence = own(raw, "cadence");
  const merchantKey = own(raw, "merchantKey");
  const amountCents = own(raw, "amountCents");
  const cadenceAssumed = own(raw, "cadenceAssumed");
  const yearlySavingCents = own(raw, "yearlySavingCents");
  const buriedAt = own(raw, "buriedAt");
  const risenReportedThrough = own(raw, "risenReportedThrough");
  if (!isText(key) || !isName(name) || !isNullOr(serviceId, isText) || !isCurrency(currency) || !isCadence(cadence) || typeof merchantKey !== "string" || !isCents(amountCents) || typeof cadenceAssumed !== "boolean" || !isRealDate(buriedAt) || !isNullOr(risenReportedThrough, isRealDate)) {
    return null;
  }
  const expected = cadenceAssumed ? null : amountCents * CADENCE_FACTOR[cadence];
  if (yearlySavingCents !== expected) return null;
  return {
    key,
    name,
    serviceId,
    currency,
    cadence,
    merchantKey,
    amountCents,
    cadenceAssumed,
    yearlySavingCents: expected,
    buriedAt,
    risenReportedThrough
  };
}
function readScanRecord(raw) {
  if (!isPlain(raw)) return null;
  const scanId = own(raw, "scanId");
  const scannedAt = own(raw, "scannedAt");
  const range = own(raw, "statementRange");
  const undeadCount = own(raw, "undeadCount");
  const yearlyTotals = readYearlyTotals(own(raw, "yearlyTotals"));
  const newCount = own(raw, "newCount");
  const possessedCount = own(raw, "possessedCount");
  if (!isText(scanId) || !isIsoDateTime(scannedAt) || !isPlain(range)) return null;
  const from = own(range, "from");
  const to = own(range, "to");
  if (!isRealDate(from) || !isRealDate(to)) return null;
  if (!isCents(undeadCount) || !isCents(newCount) || !isCents(possessedCount)) return null;
  if (yearlyTotals === null) return null;
  return {
    scanId,
    scannedAt,
    statementRange: { from, to },
    undeadCount,
    yearlyTotals,
    newCount,
    possessedCount
  };
}
function dedupe(records, id) {
  const seen = /* @__PURE__ */ new Set();
  const kept = [];
  for (const record of records) {
    const value = id(record);
    if (seen.has(value)) continue;
    seen.add(value);
    kept.push(record);
  }
  return { kept, dropped: records.length - kept.length };
}
function keepTop(records, max, rank) {
  if (records.length <= max) return records;
  const order = records.map((record, index) => ({ record, index, rank: rank(record) }));
  order.sort((a, b) => a.rank < b.rank ? 1 : a.rank > b.rank ? -1 : a.index - b.index);
  return order.slice(0, max).sort((a, b) => a.index - b.index).map((entry) => entry.record);
}
function applyLimits(history) {
  const scans = history.scans.slice(-LIMITS.scans);
  const position = /* @__PURE__ */ new Map();
  scans.forEach((scan, index) => position.set(scan.scanId, index));
  return {
    version: 1,
    coreSource: history.coreSource,
    trackedCharges: keepTop(
      history.trackedCharges,
      LIMITS.trackedCharges,
      (charge) => position.get(charge.lastSeenScan) ?? -1
    ),
    tombstones: keepTop(history.tombstones, LIMITS.tombstones, (stone) => stone.buriedAt),
    scans,
    reportedTrials: history.reportedTrials.slice(-LIMITS.reportedTrials)
  };
}
function readRecords(items, read) {
  const records = [];
  for (const item of items) {
    const record = read(item);
    if (record !== null) records.push(record);
  }
  return { records, dropped: items.length - records.length };
}
function readTrial(raw) {
  return isText(raw) ? raw : null;
}
function decodeParsed(parsed) {
  if (!isPlain(parsed)) return { kind: "unreadable" };
  const version = own(parsed, "version");
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
    return { kind: "unreadable" };
  }
  if (version > 1) return { kind: "newer", version };
  const coreSource = own(parsed, "coreSource");
  const trackedRaw = own(parsed, "trackedCharges");
  const tombstonesRaw = own(parsed, "tombstones");
  const scansRaw = own(parsed, "scans");
  const trialsRaw = own(parsed, "reportedTrials");
  if (!(coreSource === null || typeof coreSource === "string" && coreSource.length <= MAX_CORE_SOURCE_LENGTH) || !Array.isArray(trackedRaw) || !Array.isArray(tombstonesRaw) || !Array.isArray(scansRaw) || !Array.isArray(trialsRaw)) {
    return { kind: "unreadable" };
  }
  const tracked = readRecords(trackedRaw, readTrackedCharge);
  const stones = readRecords(tombstonesRaw, readTombstone);
  const scans = readRecords(scansRaw, readScanRecord);
  const trials = readRecords(trialsRaw, readTrial);
  const trackedUnique = dedupe(tracked.records, (charge) => charge.key);
  const stonesUnique = dedupe(stones.records, (stone) => stone.key);
  const scansUnique = dedupe(scans.records, (scan) => scan.scanId);
  const trialsUnique = dedupe(trials.records, (key) => key);
  const dropped = tracked.dropped + stones.dropped + scans.dropped + trials.dropped + trackedUnique.dropped + stonesUnique.dropped + scansUnique.dropped + trialsUnique.dropped;
  const history = applyLimits({
    version: 1,
    coreSource,
    trackedCharges: trackedUnique.kept,
    tombstones: stonesUnique.kept,
    scans: scansUnique.kept,
    reportedTrials: trialsUnique.kept
  });
  return { kind: "ok", history, dropped };
}
function decodeHistory(text) {
  try {
    return decodeParsed(JSON.parse(text));
  } catch {
    return { kind: "unreadable" };
  }
}

// backend/src/proxy-check.ts
import { createHash as createHash2, createHmac, timingSafeEqual } from "node:crypto";
function verifyProxyV2(i) {
  if (!i.secret || typeof i.v2Header !== "string" || typeof i.nonceHeader !== "string") {
    return false;
  }
  if (!i.v2Header || !i.nonceHeader) return false;
  if (!/^[0-9a-f]{32}$/.test(i.nonceHeader)) return false;
  const colon = i.v2Header.indexOf(":");
  const tsStr = colon < 0 ? i.v2Header : i.v2Header.slice(0, colon);
  const sig = colon < 0 ? "" : i.v2Header.slice(colon + 1);
  if (!/^[0-9]{1,12}$/.test(tsStr)) return false;
  if (sig === "") return false;
  const ts = Number(tsStr);
  if (!(i.nowSeconds - 60 <= ts && ts <= i.nowSeconds + 60)) return false;
  const bodyHash = createHash2("sha256").update(i.body).digest("hex");
  const message = `v2:${tsStr}:${i.nonceHeader}:${i.method}:${i.target}:${bodyHash}`;
  const expected = createHmac("sha256", Buffer.from(i.secret, "utf8")).update(message, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return i.cache.accept(i.nonceHeader, ts + 60, i.nowSeconds);
}

// backend/src/routes.ts
async function readHistoryFile(dataDir) {
  let text;
  try {
    text = await readFile(join(dataDir, "history.json"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { history: emptyHistory() };
    return { error: "history-unreadable" };
  }
  const decoded = decodeHistory(text);
  if (decoded.kind === "ok") return { history: decoded.history };
  return { error: decoded.kind === "newer" ? "history-newer" : "history-unreadable" };
}
function lastScanOf(history) {
  const scan = history.scans[history.scans.length - 1];
  if (scan === void 0) return null;
  return {
    scannedAt: scan.scannedAt,
    statementRange: scan.statementRange,
    undeadCount: scan.undeadCount,
    yearlyTotals: scan.yearlyTotals
  };
}
async function handle(request, context) {
  if (request.method === "GET" && request.url === "/api/health") {
    return { status: 200, json: { ok: true } };
  }
  const allowed = verifyProxyV2({
    secret: context.secret,
    v2Header: request.headers["x-kirocrew-proxy-v2"],
    nonceHeader: request.headers["x-kirocrew-proxy-nonce"],
    method: request.method,
    target: request.url,
    body: request.body,
    nowSeconds: context.nowSeconds,
    cache: context.cache
  });
  if (!allowed) return { status: 401, json: { error: "unauthorized" } };
  if (request.method !== "GET") return { status: 405, json: { error: "method-not-allowed" } };
  const path = request.url.split("?")[0];
  if (path !== "/api/graveyard") return { status: 404, json: { error: "not-found" } };
  const loaded = await readHistoryFile(context.dataDir);
  if ("error" in loaded) return { status: 200, json: { ok: false, reason: loaded.error } };
  const response = {
    ok: true,
    ...graveyardView(loaded.history, context.timeZone),
    lastScan: lastScanOf(loaded.history)
  };
  return { status: 200, json: response };
}

// backend/src/server.ts
var MAX_BODY_BYTES = 16384;
var EXIT_BAD_ENV = 2;
var env = readBackendEnv(process.env);
if (!env.ok) {
  process.stderr.write(`reaper-backend: bad env ${env.bad}
`);
  process.exit(EXIT_BAD_ENV);
} else {
  const { port, secret } = env;
  const dataDir = join2(process.cwd(), "data");
  const cache = new ReplayCache();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const send = (res, status, json, destroy) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify(json), () => destroy?.destroy());
  };
  const readBody = (req, res) => new Promise((resolve) => {
    const declared = Number(req.headers["content-length"]);
    if (req.headers["content-length"] !== void 0 && declared > MAX_BODY_BYTES) {
      send(res, 413, { error: "payload-too-large" }, req);
      resolve(null);
      return;
    }
    const chunks = [];
    let total = 0;
    let done = false;
    req.on("data", (chunk) => {
      if (done) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        done = true;
        send(res, 413, { error: "payload-too-large" }, req);
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on("error", () => {
      if (!done) {
        done = true;
        resolve(null);
      }
    });
  });
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const method = req.method ?? "";
        const url = req.url ?? "";
        if (method === "GET" && url === "/api/health") {
          send(res, 200, { ok: true });
          req.resume();
          return;
        }
        const body = await readBody(req, res);
        if (body === null) return;
        const reply = await handle(
          { method, url, headers: req.headers, body },
          { dataDir, secret, cache, nowSeconds: Date.now() / 1e3, timeZone }
        );
        if (reply.status === 401) process.stderr.write("reaper-backend: proxy check failed\n");
        send(res, reply.status, reply.json);
      } catch {
        if (!res.headersSent) send(res, 500, { error: "internal-error" });
      }
    })();
  });
  server.listen(port, "127.0.0.1");
}
