import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const EXCLUDE = ["**/node_modules/**", "vendor/**", "**/dist/**"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts", "**/*.test.tsx"],
          exclude: [...EXCLUDE, "ui/**/*.test.tsx"],
        },
      },
      {
        resolve: {
          // The host provides this module at run time; tests mock it over this stand-in.
          // Exact-match keys, so `@kirocrew/app-sdk/ui` is not rewritten by the `@kirocrew/app-sdk` entry.
          alias: [
            {
              find: /^@kirocrew\/app-sdk\/ui$/,
              replacement: fileURLToPath(new URL("ui/src/test-app-sdk-ui.tsx", import.meta.url)),
            },
            {
              find: /^@kirocrew\/app-sdk$/,
              replacement: fileURLToPath(new URL("ui/src/test-app-sdk.ts", import.meta.url)),
            },
          ],
        },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["ui/**/*.test.tsx"],
          exclude: EXCLUDE,
        },
      },
    ],
  },
});
