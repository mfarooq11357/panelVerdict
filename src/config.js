/**
 * PANELVERDICT_SEATS is a comma list of seat specs:
 *   id=model
 *   id=model@https://example.com/v1
 * Keys come from PANELVERDICT_KEY_<ID> (id uppercased, non-alnum -> _),
 * then PANELVERDICT_API_KEY, then OPENAI_API_KEY.
 *
 * Example:
 *   PANELVERDICT_SEATS=fast=gpt-4o-mini,deep=gpt-4o
 *   PANELVERDICT_CHAIR=gpt-4o-mini
 */

export function parseSeatSpec(spec) {
  const raw = spec.trim();
  if (!raw) throw new Error("empty seat spec");
  const eq = raw.indexOf("=");
  if (eq <= 0) throw new Error(`seat spec needs id=model: ${raw}`);
  const id = raw.slice(0, eq).trim();
  const rest = raw.slice(eq + 1).trim();
  const at = rest.lastIndexOf("@");
  const model = (at === -1 ? rest : rest.slice(0, at)).trim();
  const baseUrl = at === -1 ? undefined : rest.slice(at + 1).trim();
  if (!id || !model) throw new Error(`seat spec needs id=model: ${raw}`);
  if (baseUrl !== undefined && !/^https?:\/\//i.test(baseUrl)) {
    throw new Error(`seat base URL must be http(s): ${raw}`);
  }
  return { id, model, baseUrl };
}

export function keyEnvName(id) {
  return `PANELVERDICT_KEY_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

export function loadSeats(env) {
  const spec = env.PANELVERDICT_SEATS || "a=gpt-4o-mini,b=gpt-4o-mini";
  const seats = spec.split(",").map(parseSeatSpec);
  const fallback = env.PANELVERDICT_API_KEY || env.OPENAI_API_KEY || "";
  return seats.map((seat) => {
    const apiKey = env[keyEnvName(seat.id)] || fallback;
    return { ...seat, apiKey };
  });
}

export function loadChair(env, seats) {
  const model = env.PANELVERDICT_CHAIR || seats[0]?.model;
  const baseUrl = env.PANELVERDICT_CHAIR_BASE || seats[0]?.baseUrl;
  const apiKey = env.PANELVERDICT_CHAIR_KEY || env.PANELVERDICT_API_KEY || env.OPENAI_API_KEY || seats[0]?.apiKey || "";
  return { model, baseUrl, apiKey };
}

export function missingKeys(seats, chair) {
  const missing = [];
  for (const seat of seats) {
    if (!seat.apiKey) missing.push(keyEnvName(seat.id));
  }
  if (!chair.apiKey) missing.push("PANELVERDICT_CHAIR_KEY");
  return [...new Set(missing)];
}
