import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProvider, listProviders } from "../src/providers.js";

test("resolveProvider maps a known name to its chat base URL", () => {
  const groq = resolveProvider("groq");
  assert.equal(groq.id, "groq");
  assert.equal(groq.baseUrl, "https://api.groq.com/openai/v1");
  assert.equal(groq.keyEnv, "GROQ_API_KEY");
});

test("resolveProvider rejects an unknown name", () => {
  assert.throws(() => resolveProvider("not-a-provider"), /unknown provider/);
});

test("listProviders returns more than a handful, each with a base URL", () => {
  const all = listProviders();
  assert.ok(all.length >= 15);
  for (const provider of all) {
    assert.ok(provider.id);
    assert.ok(provider.keyEnv);
    if (provider.wire === "anthropic") {
      assert.equal(provider.baseUrl, null);
    } else {
      assert.match(provider.baseUrl, /^https?:\/\//);
    }
  }
  const ids = all.map((p) => p.id);
  for (const id of ["openai", "groq", "openrouter", "deepseek", "ollama", "anthropic"]) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
});
