import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeMessage, createParser, handleMessage } from "../src/mcp.js";

test("frames round-trip through the parser", () => {
  const seen = [];
  const push = createParser((message) => seen.push(message));
  const frame = encodeMessage({ jsonrpc: "2.0", id: 1, method: "ping" });
  const split = Math.floor(frame.length / 2);
  push(frame.slice(0, split));
  assert.equal(seen.length, 0);
  push(frame.slice(split));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, "ping");
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
