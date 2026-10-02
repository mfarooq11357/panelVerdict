import { test } from "node:test";
import assert from "node:assert/strict";
import { complete } from "../src/openai.js";

test("anthropic seats post to the Messages API, not chat completions", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [{ type: "text", text: "claude said this" }],
          usage: { input_tokens: 3, output_tokens: 4 },
        }),
    };
  };
  const result = await complete({
    wire: "anthropic",
    model: "claude-sonnet-4-5",
    apiKey: "sk-ant-test",
    prompt: "hello",
    fetchImpl,
  });
  assert.equal(result.text, "claude said this");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(calls[0].init.headers["x-api-key"], "sk-ant-test");
  assert.equal(calls[0].init.headers["anthropic-version"], "2023-06-01");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "claude-sonnet-4-5");
  assert.equal(body.messages[0].content, "hello");
  assert.equal(result.usage.total_tokens, 7);
});

test("openai seats still post to chat completions", async () => {
  let url = "";
  const fetchImpl = async (hit) => {
    url = hit;
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
    };
  };
  const result = await complete({ model: "gpt-4o-mini", apiKey: "sk", prompt: "hi", fetchImpl });
  assert.equal(result.text, "ok");
  assert.equal(url, "https://api.openai.com/v1/chat/completions");
});
