// backend/src/server.ts
import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import { join } from "node:path";
async function historyBytes() {
  try {
    return (await stat(join(process.cwd(), "data", "history.json"))).size;
  } catch {
    return null;
  }
}
function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
var server = createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0];
  if (req.method === "GET" && path === "/api/health") {
    send(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" && path === "/api/graveyard") {
    historyBytes().then(
      (n) => send(res, 200, { ok: true, historyBytes: n }),
      () => send(res, 200, { ok: true, historyBytes: null })
    );
    return;
  }
  send(res, 404, { ok: false });
});
server.listen(Number(process.env["PORT"] ?? 0), "127.0.0.1");
