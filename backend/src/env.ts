// Backend environment check (design "Start"). Never returns or logs a value.

export type BackendEnv =
  { ok: true; port: number; secret: string } | { ok: false; bad: "PORT" | "KIROCREW_PROXY_SECRET" };

const MAX_PORT = 65535;

export function readBackendEnv(env: Readonly<Record<string, string | undefined>>): BackendEnv {
  const rawPort = env["PORT"];
  if (typeof rawPort !== "string" || !/^[1-9][0-9]{0,4}$/.test(rawPort)) {
    return { ok: false, bad: "PORT" };
  }
  const port = Number(rawPort);
  if (port > MAX_PORT) return { ok: false, bad: "PORT" };
  const secret = env["KIROCREW_PROXY_SECRET"];
  if (typeof secret !== "string" || secret === "") {
    return { ok: false, bad: "KIROCREW_PROXY_SECRET" };
  }
  return { ok: true, port, secret };
}
