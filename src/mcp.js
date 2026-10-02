/**
 * Tiny MCP stdio server. One tool: panel_verdict.
 * Speaks JSON-RPC 2.0 over newline-delimited Content-Length frames,
 * which is what Claude Code, Cursor, Codex, and the other MCP clients send.
 */
import { runPanel } from "./panel.js";
import { loadSeats, loadChair, missingKeys } from "./config.js";

const PROTOCOL = "2025-06-18";
const SERVER = { name: "panelverdict", version: "0.1.0" };

const TOOL = {
  name: "panel_verdict",
  description:
    "Ask the configured panel of AI models one question. They draft independently, score each other without seeing who wrote what, and a chair returns one verdict plus a minority report. Agreement is a cross-check, not proof. Use this when a coding decision is expensive to get wrong, not for every small edit.",
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The decision or question. Include the constraints that matter.",
      },
    },
    required: ["question"],
  },
};

export function encodeMessage(obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8"), body]);
}

export function createParser(onMessage) {
  let buffer = Buffer.alloc(0);
  return function push(chunk) {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    const messages = [];
    while (true) {
      const sep = buffer.indexOf("\r\n\r\n");
      if (sep === -1) break;
      const header = buffer.slice(0, sep).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.slice(sep + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = sep + 4;
      if (buffer.length < start + length) break;
      const raw = buffer.slice(start, start + length).toString("utf8");
      buffer = buffer.slice(start + length);
      const message = JSON.parse(raw);
      messages.push(message);
      onMessage(message);
    }
    return messages;
  };
}

export async function handleMessage(message, deps = {}) {
  if (!message || typeof message !== "object") return null;
  if (message.id === undefined && message.method) return null;
  const id = message.id ?? null;
  try {
    if (message.method === "initialize") {
      return result(id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
      });
    }
    if (message.method === "tools/list") {
      return result(id, { tools: [TOOL] });
    }
    if (message.method === "tools/call") {
      return result(id, await callTool(message.params, deps));
    }
    if (message.method === "ping") return result(id, {});
    return error(id, -32601, `unknown method: ${message.method}`);
  } catch (err) {
    return error(id, -32603, err.message || String(err));
  }
}

async function callTool(params, deps) {
  if (params?.name !== TOOL.name) {
    return toolError(`unknown tool: ${params?.name}`);
  }
  const question = params?.arguments?.question;
  if (typeof question !== "string" || question.trim() === "") {
    return toolError("question is required");
  }
  const env = deps.env ?? process.env;
  const seats = loadSeats(env);
  const chair = loadChair(env, seats);
  const missing = missingKeys(seats, chair);
  if (missing.length) {
    return toolError(`missing API key: ${missing.join(", ")}. Set it in the MCP server env, not in the tool call.`);
  }
  const report = await runPanel({
    question: question.trim(),
    seats,
    chair,
    completeImpl: deps.completeImpl,
  });
  return {
    content: [{ type: "text", text: JSON.stringify(publicReport(report), null, 2) }],
    isError: false,
  };
}

function publicReport(report) {
  return {
    verdict: report.verdict,
    dissent: report.dissent,
    caveats: report.caveats,
    confidence: report.confidence,
    spread: report.spread,
    ranking: report.ranking.map((row) => ({
      label: row.label,
      seat: row.seat?.id ?? null,
      model: row.seat?.model ?? null,
      mean: row.mean,
      votes: row.votes,
    })),
    judgeErrors: report.judgeErrors,
    note: "Agreement is a cross-check, not proof. A confident panel can still be wrong together.",
  };
}

function toolError(text) {
  return { content: [{ type: "text", text }], isError: true };
}

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function serve(io = {}) {
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout;
  const push = createParser((message) => {
    handleMessage(message, io).then((response) => {
      if (response) output.write(encodeMessage(response));
    }).catch((err) => {
      const id = message && message.id !== undefined ? message.id : null;
      output.write(encodeMessage(error(id, -32603, err.message || String(err))));
    });
  });
  input.on("data", push);
  input.on("error", () => process.exit(1));
}
