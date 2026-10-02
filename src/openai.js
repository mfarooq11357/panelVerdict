const DEFAULT_BASE = "https://api.openai.com/v1";

/**
 * One non-streaming chat completion against an OpenAI-compatible endpoint.
 * @param {{ baseUrl?: string, apiKey: string, model: string, prompt: string, temperature?: number, timeoutMs?: number, fetchImpl?: typeof fetch }} opts
 */
export async function complete(opts) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("no fetch implementation");
  }
  const base = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  const timeoutMs = opts.timeoutMs ?? 120000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: opts.temperature ?? 0.2,
        messages: [{ role: "user", content: opts.prompt }],
      }),
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error(`timeout after ${timeoutMs}ms calling ${opts.model}`);
    }
    throw new Error(`request failed for ${opts.model}: ${err.message || err}`);
  } finally {
    clearTimeout(timer);
  }
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${opts.model}: ${raw.slice(0, 400)}`);
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`non-JSON HTTP body from ${opts.model}`);
  }
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
