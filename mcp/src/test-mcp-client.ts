// Test helper: talks to a spawned MCP server in raw newline-delimited JSON-RPC.
// It imports no SDK client (the lint rule bans every SDK subpath except the two server ones).
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

interface JsonRpcReply {
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface ToolCallResult {
  isError: boolean;
  /** The JSON text of the first content item, parsed. */
  value: unknown;
}

export interface McpTestClient {
  /** Every stderr chunk received so far, joined. */
  stderr: () => string;
  listTools: () => Promise<string[]>;
  callTool: (name: string, args?: Record<string, unknown>) => Promise<ToolCallResult>;
  close: () => Promise<void>;
}

export async function startMcpClient(options: {
  script: string;
  cwd: string;
  env: Record<string, string | undefined>;
}): Promise<McpTestClient> {
  const child: ChildProcessWithoutNullStreams = spawn("node", [options.script], {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderrText = "";
  let stdoutBuffer = "";
  let nextId = 1;
  const waiting = new Map<number, (reply: JsonRpcReply) => void>();

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrText += chunk;
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    let newline = stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (line.length > 0) {
        const reply = JSON.parse(line) as JsonRpcReply; // the server writes only JSON-RPC frames
        if (reply.id !== undefined) {
          waiting.get(reply.id)?.(reply);
          waiting.delete(reply.id);
        }
      }
      newline = stdoutBuffer.indexOf("\n");
    }
  });

  const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));

  const send = (message: object): void => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  const request = (method: string, params: object): Promise<JsonRpcReply> => {
    const id = nextId++;
    const reply = new Promise<JsonRpcReply>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no reply to ${method}`)), 20_000);
      waiting.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
    send({ jsonrpc: "2.0", id, method, params });
    return reply;
  };

  const init = await request("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-mcp-client", version: "0.0.0" },
  });
  if (init.error) throw new Error("initialize failed");
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  return {
    stderr: () => stderrText,
    async listTools() {
      const reply = await request("tools/list", {});
      const tools = (reply.result as { tools: { name: string }[] }).tools;
      return tools.map((t) => t.name);
    },
    async callTool(name, args = {}) {
      const reply = await request("tools/call", { name, arguments: args });
      const result = reply.result as { isError?: boolean; content: { text: string }[] };
      const text = result.content[0]?.text ?? "";
      let value: unknown = text;
      try {
        value = JSON.parse(text);
      } catch {
        // An SDK-level error (for example an unknown key) is plain text; keep it as is.
      }
      return { isError: result.isError === true, value };
    },
    async close() {
      child.stdin.end();
      child.kill();
      await exited;
    },
  };
}
