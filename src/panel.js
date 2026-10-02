import { seatMap } from "./aggregate.js";
import { tally, disagreement, confidenceFromSpread } from "./aggregate.js";
import { extractJson, clampScore } from "./parse.js";
import { draftPrompt, judgePrompt, chairPrompt } from "./prompts.js";
import { complete } from "./openai.js";
import { labelFor } from "./labels.js";

/**
 * Run the panel.
 *
 * seats: [{ id, model, baseUrl?, apiKey, temperature? }]
 * The chair is a separate call so it does not vote on its own draft.
 *
 * @param {{
 *   question: string,
 *   seats: Array<{id: string, model: string, baseUrl?: string, apiKey: string, temperature?: number}>,
 *   chair: { model: string, baseUrl?: string, apiKey: string },
 *   completeImpl?: typeof complete,
 *   onEvent?: (event: object) => void,
 * }} opts
 */
export async function runPanel(opts) {
  const question = (opts.question || "").trim();
  if (!question) throw new Error("question is empty");
  if (!Array.isArray(opts.seats) || opts.seats.length < 2) {
    throw new Error("need at least 2 seats");
  }
  if (opts.seats.length > 6) throw new Error("at most 6 seats");
  if (!opts.chair?.model || !opts.chair?.apiKey) {
    throw new Error("chair model and apiKey are required");
  }
  const ids = new Set();
  for (const seat of opts.seats) {
    if (!seat.id || !seat.model || !seat.apiKey) {
      throw new Error("each seat needs id, model, and apiKey");
    }
    if (ids.has(seat.id)) throw new Error(`duplicate seat id: ${seat.id}`);
    ids.add(seat.id);
  }

  const call = opts.completeImpl ?? complete;
  const emit = opts.onEvent ?? (() => {});
  const seats = seatMap(opts.seats);

  emit({ type: "drafts:start", seats: seats.map((s) => ({ label: s.label, id: s.id, model: s.model })) });

  const draftResults = await Promise.all(
    opts.seats.map(async (seat, i) => {
      const label = labelFor(i);
      try {
        const result = await call({
          baseUrl: seat.baseUrl,
          apiKey: seat.apiKey,
          model: seat.model,
          wire: seat.wire,
          temperature: seat.temperature ?? 0.4,
          prompt: draftPrompt(question),
        });
        emit({ type: "draft:ok", label, id: seat.id });
        return { label, id: seat.id, model: seat.model, text: result.text.trim(), usage: result.usage, error: null };
      } catch (err) {
        emit({ type: "draft:error", label, id: seat.id, error: err.message });
        return { label, id: seat.id, model: seat.model, text: "", usage: null, error: err.message };
      }
    }),
  );

  const drafts = draftResults.filter((d) => d.text);
  if (drafts.length < 2) {
    const detail = draftResults.map((d) => `${d.id}: ${d.error || "ok"}`).join("; ");
    throw new Error(`need at least 2 successful drafts, got ${drafts.length} (${detail})`);
  }

  const blindDrafts = drafts.map((d) => ({ label: d.label, text: d.text }));
  emit({ type: "judge:start" });
  const ballots = [];
  const judgeErrors = [];
  await Promise.all(
    drafts.map(async (draft) => {
      const seat = opts.seats.find((s) => s.id === draft.id);
      try {
        const result = await call({
          baseUrl: seat.baseUrl,
          apiKey: seat.apiKey,
          model: seat.model,
          wire: seat.wire,
          temperature: 0,
          prompt: judgePrompt(question, blindDrafts),
        });
        const parsed = extractJson(result.text);
        const scores = normalizeScores(parsed, drafts.map((d) => d.label), draft.label);
        ballots.push({ voter: draft.label, scores, usage: result.usage });
        emit({ type: "judge:ok", voter: draft.label });
      } catch (err) {
        judgeErrors.push({ voter: draft.label, error: err.message });
        emit({ type: "judge:error", voter: draft.label, error: err.message });
      }
    }),
  );

  if (ballots.length === 0) {
    throw new Error(`every judge failed: ${judgeErrors.map((e) => e.error).join("; ")}`);
  }

  const labels = drafts.map((d) => d.label);
  const { ranking, rejected } = tally(ballots, labels);
  const spread = disagreement(ranking);
  const confidence = confidenceFromSpread(spread);

  emit({ type: "chair:start" });
  const chairRaw = await call({
    baseUrl: opts.chair.baseUrl,
    apiKey: opts.chair.apiKey,
    model: opts.chair.model,
    wire: opts.chair.wire,
    temperature: 0.2,
    prompt: chairPrompt(question, blindDrafts, ranking),
  });
  const chair = normalizeChair(extractJson(chairRaw.text));

  const winner = ranking[0];
  return {
    question,
    confidence,
    spread: round1(spread),
    winner: {
      label: winner.label,
      mean: winner.mean === null ? null : round1(winner.mean),
      seat: seats.find((s) => s.label === winner.label) ?? null,
    },
    ranking: ranking.map((row) => ({
      label: row.label,
      mean: row.mean === null ? null : round1(row.mean),
      votes: row.votes,
      seat: seats.find((s) => s.label === row.label) ?? null,
      reasons: row.reasons,
    })),
    verdict: chair.verdict,
    dissent: chair.dissent,
    caveats: chair.caveats,
    drafts: draftResults,
    ballots,
    rejected,
    judgeErrors,
    usage: sumUsage([...draftResults, ...ballots, { usage: chairRaw.usage }]),
  };
}

function normalizeScores(parsed, labels, voter) {
  const raw = parsed?.scores && typeof parsed.scores === "object" ? parsed.scores : parsed;
  const scores = {};
  for (const label of labels) {
    if (label === voter) continue;
    const entry = raw?.[label];
    const score = clampScore(entry?.score ?? entry);
    if (score === null) continue;
    const reason = typeof entry === "object" && entry ? entry.reason : "";
    scores[label] = { score, reason: reason ? String(reason) : "" };
  }
  if (Object.keys(scores).length === 0) {
    throw new Error("judge returned no usable scores");
  }
  return scores;
}

function normalizeChair(parsed) {
  if (!parsed || typeof parsed.verdict !== "string" || parsed.verdict.trim() === "") {
    throw new Error("chair returned no verdict");
  }
  const caveats = Array.isArray(parsed.caveats)
    ? parsed.caveats.map((c) => String(c)).filter(Boolean)
    : [];
  return {
    verdict: parsed.verdict.trim(),
    dissent: typeof parsed.dissent === "string" ? parsed.dissent.trim() : "",
    caveats,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function sumUsage(items) {
  const totals = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, calls: 0 };
  for (const item of items) {
    const u = item?.usage;
    if (!u) continue;
    totals.calls += 1;
    for (const key of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
      if (Number.isFinite(u[key])) totals[key] += u[key];
    }
  }
  return totals;
}
