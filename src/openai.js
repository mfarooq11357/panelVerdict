const DEFAULT_BASE = "https://api.openai.com/v1";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * One non-streaming completion.
 * wire "anthropic" posts to the Messages API. Everything else is OpenAI chat completions.
 * @param {{ baseUrl?: string, apiKey: string, model: string, prompt: string, temperature?: number, timeoutMs?: number, wire?: string, fetchImpl?: typeof fetch }} opts
 */
export async function complete(opts) {
  if (opts.wire === "anthropic") return completeAnthropic(opts);
  return completeOpenAI(opts);
}

async function completeOpenAI(opts) {
  const base = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  const { res, raw } = await postJson(
    `${base}/chat/completions`,
    {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
    },
    {
      model: opts.model,
      temperature: opts.temperature ?? 0.2,
      messages: [{ role: "user", content: opts.prompt }],
    },
    opts,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${opts.model}: ${raw.slice(0, 400)}`);
  const body = parseBody(raw, opts.model);
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error(`empty completion from ${opts.model}`);
  }
  const usage = body.usage || {};
  return {
    text,
    model: body.model || opts.model,
    usage: {
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: usage.completion_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
    },
  };
}

async function completeAnthropic(opts) {
  const { res, raw } = await postJson(
    ANTHROPIC_URL,
    {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    {
      model: opts.model,
      max_tokens: 4096,
      temperature: opts.temperature ?? 0.2,
      messages: [{ role: "user", content: opts.prompt }],
    },
    opts,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${opts.model}: ${raw.slice(0, 400)}`);
  const body = parseBody(raw, opts.model);
  const blocks = Array.isArray(body.content) ? body.content : [];
  const text = blocks
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  if (!text.trim()) throw new Error(`empty completion from ${opts.model}`);
  const input = body.usage?.input_tokens ?? null;
  const output = body.usage?.output_tokens ?? null;
  return {
    text,
    model: body.model || opts.model,
    usage: {
      prompt_tokens: input,
      completion_tokens: output,
      total_tokens: Number.isFinite(input) && Number.isFinite(output) ? input + output : null,
    },
  };
}

async function postJson(url, headers, body, opts) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("no fetch implementation");
  const timeoutMs = opts.timeoutMs ?? 120000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify(body),
    });
    return { res, raw: await res.text() };
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error(`timeout after ${timeoutMs}ms calling ${opts.model}`);
    }
    throw new Error(`request failed for ${opts.model}: ${err.message || err}`);
  } finally {
    clearTimeout(timer);
  }
}

function parseBody(raw, model) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`non-JSON HTTP body from ${model}`);
  }
}
