import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const PRIVACY_MESSAGE = "The Reaper makes no network calls and spawns no processes (privacy.md).";
const SDK_MESSAGE =
  "Only @modelcontextprotocol/sdk/server/mcp.js and server/stdio.js may be imported (privacy.md).";
const BARE_MESSAGE = "Import Node built-ins with the node: prefix only (privacy.md).";

// Built-in modules that may only be imported with the node: prefix, so one rule set covers them.
const BARE_BUILTINS = [
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "dns/promises",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "readline/promises",
  "stream",
  "stream/promises",
  "string_decoder",
  "timers",
  "timers/promises",
  "tls",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
];

const NETWORK_PACKAGES = ["undici", "ws", "axios", "node-fetch"];
const NODE_NETWORK_MODULES = ["node:net", "node:tls", "node:dgram", "node:dns", "node:https"];

const RESTRICTED_GLOBALS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "navigator"].map(
  (name) => ({ name, message: PRIVACY_MESSAGE }),
);

/**
 * Builds the `no-restricted-imports` options. Flat config replaces rule options block by block,
 * so every block that changes the list builds the whole list again.
 *
 * @param {{ nodeBuiltins?: boolean, childProcess?: boolean, http?: boolean }} allow
 *   `nodeBuiltins: false` drops every node: ban (test files). `childProcess` and `http` allow
 *   `node:child_process` and `node:http` for one file.
 */
function restrictedImports({ nodeBuiltins = true, childProcess = true, http = true } = {}) {
  const paths = [
    ...NETWORK_PACKAGES.map((name) => ({ name, message: PRIVACY_MESSAGE })),
    ...BARE_BUILTINS.map((name) => ({ name, message: BARE_MESSAGE })),
    { name: "@modelcontextprotocol/sdk", message: SDK_MESSAGE },
  ];
  if (nodeBuiltins) {
    paths.push(...NODE_NETWORK_MODULES.map((name) => ({ name, message: PRIVACY_MESSAGE })));
    if (childProcess) paths.push({ name: "node:child_process", message: PRIVACY_MESSAGE });
    if (http) paths.push({ name: "node:http", message: PRIVACY_MESSAGE });
  }
  return [
    "error",
    {
      paths,
      patterns: [
        {
          regex: "^@modelcontextprotocol/sdk/(?!server/(?:mcp|stdio)\\.js$)",
          message: SDK_MESSAGE,
        },
      ],
    },
  ];
}

export default tseslint.config(
  { ignores: ["node_modules/**", "vendor/**", "**/dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-restricted-globals": ["error", ...RESTRICTED_GLOBALS],
      "no-restricted-imports": restrictedImports({ childProcess: true, http: true }),
    },
  },
  {
    files: ["mcp/**", "shared/**"],
    rules: {
      "no-console": ["error"],
    },
  },
  {
    // Classic JSX (`jsxFactory: "h"`): the `h` import is used by the compiled JSX only.
    files: ["ui/**/*.tsx"],
    rules: { "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^h$" }] },
  },
  {
    // The one file that spawns npm and git on the local Zombills repo.
    files: ["scripts/sync-core.ts"],
    rules: { "no-restricted-imports": restrictedImports({ childProcess: false }) },
  },
  {
    // The one file that calls createServer for the backend.
    files: ["backend/src/server.ts"],
    rules: { "no-restricted-imports": restrictedImports({ http: false }) },
  },
  {
    // Tests spawn the bundles, call the backend on 127.0.0.1 and stub network functions.
    // Only the node: built-in bans are lifted; every other rule still applies.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test-*.ts"],
    rules: { "no-restricted-imports": restrictedImports({ nodeBuiltins: false }) },
  },
  eslintConfigPrettier,
);
