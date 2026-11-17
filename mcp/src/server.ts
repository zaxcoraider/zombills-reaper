import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { appRootFromModule, dataDirOf } from "./app-paths.js";
import { APP_VERSION, CORE_SOURCE } from "./core-source.js";
import { createReaperTools } from "./tools.js";

const appRoot = appRootFromModule(import.meta.url);
const tools = createReaperTools({
  dataDir: dataDirOf(appRoot),
  appRoot,
  now: () => new Date(),
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  coreSource: CORE_SOURCE,
});

const server = new McpServer({ name: "zombills-reaper", version: APP_VERSION });

for (const [name, tool] of tools) {
  server.registerTool(
    name,
    { description: tool.description, inputSchema: tool.inputSchema },
    async (args: unknown) => {
      const result = await tool.handler(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }], isError: false };
    },
  );
}

await server.connect(new StdioServerTransport());
