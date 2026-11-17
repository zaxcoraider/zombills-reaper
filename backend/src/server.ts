// Backend entry (design "Start" and "Request handling"). Listens on 127.0.0.1 only.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { readBackendEnv } from "./env.ts";
import { ReplayCache } from "./replay-cache.ts";
import { handle } from "./routes.ts";

const MAX_BODY_BYTES = 16384;
const EXIT_BAD_ENV = 2;

const env = readBackendEnv(process.env);
if (!env.ok) {
  process.stderr.write(`reaper-backend: bad env ${env.bad}\n`);
  process.exit(EXIT_BAD_ENV);
} else {
  const { port, secret } = env;
  const dataDir = join(process.cwd(), "data");
  const cache = new ReplayCache();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const send = (res: ServerResponse, status: number, json: unknown, destroy?: IncomingMessage) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(json), () => destroy?.destroy());
  };

  // Resolves to the body, or null once it passes the limit (a 413 has been sent).
  const readBody = (req: IncomingMessage, res: ServerResponse): Promise<Buffer | null> =>
    new Promise((resolve) => {
      const declared = Number(req.headers["content-length"]);
      if (req.headers["content-length"] !== undefined && declared > MAX_BODY_BYTES) {
        send(res, 413, { error: "payload-too-large" }, req);
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      let done = false;
      req.on("data", (chunk: Buffer) => {
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
          { dataDir, secret, cache, nowSeconds: Date.now() / 1000, timeZone },
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
