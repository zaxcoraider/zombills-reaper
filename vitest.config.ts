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
