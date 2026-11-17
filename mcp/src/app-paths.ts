import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The bundle sits at `<App root>/mcp/dist/server.js`, so the App root is two folders up. */
export function appRootFromModule(url: string): string {
  return resolve(dirname(fileURLToPath(url)), "../..");
}

export function dataDirOf(appRoot: string): string {
  return join(appRoot, "data");
}
