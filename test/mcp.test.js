import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeMessage, createParser, handleMessage } from "../src/mcp.js";

test("newline frames round-trip, and Content-Length frames still parse", () => {
  const seen = [];
  const push = createParser((message) => seen.push(message));
  push(encodeMessage({ jsonrpc: "2.0", id: 1, method: "ping" }));
  assert.equal(seen[0].method, "ping");
  const body = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  push(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  assert.equal(seen[1].method, "tools/list");
});

test("initialize and tools/list advertise the one tool", async () => {
  const init = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(init.result.serverInfo.name, "panelverdict");
  assert.equal(init.result.capabilities.tools.listChanged, false);
  const list = await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(list.result.tools.length, 1);
  assert.equal(list.result.tools[0].name, "panel_verdict");
});

test("a tool call with no key returns an error result, not a throw", async () => {
  const response = await handleMessage(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "panel_verdict", arguments: { question: "queue or cron?" } } },
    { env: {} },
  );
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /missing API key/);
});

test("a tool call runs the panel and hides raw drafts", async () => {
  const completeImpl = (opts) => {
    if (opts.prompt.startsWith("Answer")) {
      return Promise.resolve({ text: `draft ${opts.model}`, model: opts.model, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    }
    if (opts.prompt.startsWith("You are grading")) {
      return Promise.resolve({
        text: '{"scores":{"A":{"score":8,"reason":"ok"},"B":{"score":5,"reason":"thin"}}}',
        model: opts.model,
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }
    return Promise.resolve({
      text: '{"verdict":"Use a queue.","dissent":"","caveats":["check volume"]}',
      model: opts.model,
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  };
  const response = await handleMessage(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "panel_verdict", arguments: { question: "queue?" } } },
    {
      env: { PANELVERDICT_SEATS: "a=demo-a,b=demo-b", PANELVERDICT_API_KEY: "test" },
      completeImpl,
    },
  );
  assert.equal(response.result.isError, false);
  const report = JSON.parse(response.result.content[0].text);
  assert.equal(report.verdict, "Use a queue.");
  assert.equal(report.ranking[0].seat, "a");
  assert.equal(report.drafts, undefined);
});

test("notifications get no response", async () => {
  const response = await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(response, null);
});
