import { resolveProvider } from "./providers.js";

/**
 * PANELVERDICT_SEATS is a comma list of seat specs:
 *   id=model
 *   id=provider:model
 *   id=model@https://example.com/v1
 *   id=provider:model@https://override.example/v1
 *
 * Keys, first match wins:
 *   PANELVERDICT_KEY_<ID>
 *   the provider's own env var (GROQ_API_KEY, ...)
 *   PANELVERDICT_API_KEY
 *   OPENAI_API_KEY
 */

export function parseSeatSpec(spec) {
  const raw = spec.trim();
  if (!raw) throw new Error("empty seat spec");
  const eq = raw.indexOf("=");
  if (eq <= 0) throw new Error(`seat spec needs id=model: ${raw}`);
  const id = raw.slice(0, eq).trim();
  const rest = raw.slice(eq + 1).trim();
  const at = rest.lastIndexOf("@");
  const modelPart = (at === -1 ? rest : rest.slice(0, at)).trim();
  const explicitBase = at === -1 ? undefined : rest.slice(at + 1).trim();
  if (!id || !modelPart) throw new Error(`seat spec needs id=model: ${raw}`);
  if (explicitBase !== undefined && !/^https?:\/\//i.test(explicitBase)) {
    throw new Error(`seat base URL must be http(s): ${raw}`);
  }

  const colon = modelPart.indexOf(":");
  let provider;
  let model = modelPart;
  if (colon > 0) {
    const maybe = modelPart.slice(0, colon);
    try {
      provider = resolveProvider(maybe);
      model = modelPart.slice(colon + 1).trim();
    } catch (err) {
      if (!String(err.message).startsWith("unknown provider:")) throw err;
    }
  }
  if (!model) throw new Error(`seat spec needs a model: ${raw}`);

  return {
    id,
    model,
    provider: provider?.id,
    wire: provider?.wire || "openai",
    baseUrl: explicitBase || provider?.baseUrl || undefined,
    keyEnv: provider?.keyEnv,
  };
}

export function keyEnvName(id) {
  return `PANELVERDICT_KEY_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

export function loadSeats(env) {
  const spec = env.PANELVERDICT_SEATS || "a=gpt-4o-mini,b=gpt-4o-mini";
  const seats = spec.split(",").map(parseSeatSpec);
  const fallback = env.PANELVERDICT_API_KEY || env.OPENAI_API_KEY || "";
  return seats.map((seat) => {
    const apiKey = env[keyEnvName(seat.id)] || (seat.keyEnv && env[seat.keyEnv]) || fallback;
    return { ...seat, apiKey };
  });
}

export function loadChair(env, seats) {
  const spec = env.PANELVERDICT_CHAIR;
  if (spec && spec.includes(":")) {
    const parsed = parseSeatSpec(`chair=${spec}`);
    return {
      model: parsed.model,
      baseUrl: env.PANELVERDICT_CHAIR_BASE || parsed.baseUrl,
      wire: parsed.wire,
      apiKey:
        env.PANELVERDICT_CHAIR_KEY ||
        (parsed.keyEnv && env[parsed.keyEnv]) ||
        env.PANELVERDICT_API_KEY ||
        env.OPENAI_API_KEY ||
        "",
    };
  }
  const model = spec || seats[0]?.model;
  const baseUrl = env.PANELVERDICT_CHAIR_BASE || (spec ? undefined : seats[0]?.baseUrl);
  const apiKey =
    env.PANELVERDICT_CHAIR_KEY ||
    env.PANELVERDICT_API_KEY ||
    env.OPENAI_API_KEY ||
    (spec ? "" : seats[0]?.apiKey) ||
    "";
  return {
    model,
    baseUrl,
    wire: spec ? "openai" : seats[0]?.wire || "openai",
    apiKey,
  };
}

export function missingKeys(seats, chair) {
  const missing = [];
  for (const seat of seats) {
    if (!seat.apiKey) missing.push(seat.keyEnv || keyEnvName(seat.id));
  }
  if (!chair.apiKey) missing.push("PANELVERDICT_CHAIR_KEY");
  return [...new Set(missing)];
}
