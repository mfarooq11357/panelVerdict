import { test } from "node:test";
import assert from "node:assert/strict";
import { tally, disagreement, confidenceFromSpread, mean } from "../src/aggregate.js";
import { extractJson, clampScore } from "../src/parse.js";
import { parseSeatSpec, keyEnvName, loadSeats, missingKeys, loadChair } from "../src/config.js";
import { renderMarkdown } from "../src/render.js";
import { runPanel } from "../src/panel.js";

test("mean ignores non-finite values", () => {
  assert.equal(mean([1, 3, NaN]), 2);
  assert.equal(mean([]), null);
});

test("tally drops self-scores and ranks by mean", () => {
  const ballots = [
    { voter: "A", scores: { A: { score: 10 }, B: { score: 4, reason: "thin" } } },
    { voter: "B", scores: { A: { score: 8, reason: "specific" }, B: { score: 9 } } },
  ];
  const { ranking, rejected } = tally(ballots, ["A", "B"]);
  assert.equal(ranking[0].label, "A");
  assert.equal(ranking[0].mean, 8);
  assert.equal(ranking[1].mean, 4);
  assert.equal(ranking[0].votes, 1);
  assert.ok(rejected.some((r) => r.reason.includes("self-score")));
});

test("disagreement and confidence", () => {
  assert.equal(disagreement([{ mean: 8 }, { mean: 6.5 }]), 1.5);
  assert.equal(confidenceFromSpread(0.5), "high");
  assert.equal(confidenceFromSpread(2), "medium");
  assert.equal(confidenceFromSpread(4), "low");
});

test("extractJson reads fenced and messy replies", () => {
  assert.deepEqual(extractJson('sure\n```json\n{"scores":{"A":{"score":7}}}\n```\n'), {
    scores: { A: { score: 7 } },
  });
  assert.deepEqual(extractJson('prefix {"ok":true} suffix'), { ok: true });
});

test("extractJson rejects empty input", () => {
  assert.throws(() => extractJson("no object here"), /no JSON/);
});

test("clampScore bounds integers", () => {
  assert.equal(clampScore(0), 1);
  assert.equal(clampScore(10.4), 10);
  assert.equal(clampScore("nope"), null);
});

test("seat spec parses model and base URL", () => {
  assert.deepEqual(parseSeatSpec("fast=gpt-4o-mini"), {
    id: "fast",
    model: "gpt-4o-mini",
    provider: undefined,
    wire: "openai",
    baseUrl: undefined,
    keyEnv: undefined,
  });
  assert.equal(parseSeatSpec("local=llama@http://127.0.0.1:11434/v1").baseUrl, "http://127.0.0.1:11434/v1");
  assert.throws(() => parseSeatSpec("nocolon"), /id=model/);
});

test("named providers fill base URL and that provider's key", () => {
  const seats = loadSeats({
    PANELVERDICT_SEATS: "g=groq:llama-3.3-70b-versatile,o=openai:gpt-4o-mini",
    GROQ_API_KEY: "gsk-test",
    OPENAI_API_KEY: "sk-test",
  });
  assert.equal(seats[0].provider, "groq");
  assert.equal(seats[0].baseUrl, "https://api.groq.com/openai/v1");
  assert.equal(seats[0].apiKey, "gsk-test");
  assert.equal(seats[0].model, "llama-3.3-70b-versatile");
  assert.equal(seats[1].provider, "openai");
  assert.equal(seats[1].apiKey, "sk-test");
});

test("an explicit URL overrides the named provider", () => {
  const seats = loadSeats({
    PANELVERDICT_SEATS: "g=groq:llama@http://127.0.0.1:9/v1",
    GROQ_API_KEY: "gsk-test",
  });
  assert.equal(seats[0].baseUrl, "http://127.0.0.1:9/v1");
  assert.equal(seats[0].provider, "groq");
  assert.equal(seats[0].model, "llama");
});

test("keys resolve per seat then fallback", () => {
  assert.equal(keyEnvName("seat-a"), "PANELVERDICT_KEY_SEAT_A");
  const seats = loadSeats({
    PANELVERDICT_SEATS: "a=m1,b=m2",
    PANELVERDICT_KEY_A: "key-a",
    OPENAI_API_KEY: "fallback",
  });
  assert.equal(seats[0].apiKey, "key-a");
  assert.equal(seats[1].apiKey, "fallback");
  const chair = loadChair({ PANELVERDICT_CHAIR: "chair-model", OPENAI_API_KEY: "fallback" }, seats);
  assert.equal(chair.model, "chair-model");
  assert.equal(chair.wire, "openai");
  assert.equal(chair.baseUrl, undefined);
  assert.deepEqual(missingKeys([{ id: "a", apiKey: "" }], { apiKey: "" }), [
    "PANELVERDICT_KEY_A",
    "PANELVERDICT_CHAIR_KEY",
  ]);
});

test("runPanel hides labels from the caller map and ignores a failed seat", async () => {
  const calls = [];
  const completeImpl = (opts) => {
    calls.push(opts.model);
    if (opts.model === "dead") return Promise.reject(new Error("boom"));
    if (opts.prompt.startsWith("Answer")) {
      return Promise.resolve({
        text: opts.model === "gpt-a" ? "Use a queue and a dead-letter topic." : "Retry forever in-process.",
        model: opts.model,
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }
    if (opts.prompt.startsWith("You are grading")) {
      assert.doesNotMatch(opts.prompt, /gpt-a|gpt-b/);
      assert.match(opts.prompt, /Answer A/);
      return Promise.resolve({
        text: '{"scores":{"A":{"score":9,"reason":"good"},"B":{"score":4,"reason":"weak"}}}',
        model: opts.model,
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }
    return Promise.resolve({
      text: '{"verdict":"Ship the queue.","dissent":"One draft wanted a cron.","caveats":["demo"]}',
      model: opts.model,
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  };

  const report = await runPanel({
    question: "queue or cron?",
    seats: [
      { id: "alpha", model: "gpt-a", apiKey: "k" },
      { id: "beta", model: "gpt-b", apiKey: "k" },
      { id: "gamma", model: "dead", apiKey: "k" },
    ],
    chair: { model: "gpt-chair", apiKey: "k" },
    completeImpl,
  });

  assert.equal(report.verdict, "Ship the queue.");
  assert.equal(report.winner.label, "A");
  assert.equal(report.winner.seat.id, "alpha");
  assert.equal(report.confidence, "low");
  assert.equal(report.drafts.find((d) => d.id === "gamma").error, "boom");
  assert.match(renderMarkdown(report), /Ship the queue/);
  assert.match(renderMarkdown(report), /not proof/);
});

test("runPanel refuses a single seat", async () => {
  await assert.rejects(
    () => runPanel({ question: "x", seats: [{ id: "a", model: "m", apiKey: "k" }], chair: { model: "m", apiKey: "k" } }),
    /at least 2 seats/,
  );
});
