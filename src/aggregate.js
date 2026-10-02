import { labelFor } from "./labels.js";

/**
 * Mean of finite numbers. Returns null when none are finite.
 */
export function mean(values) {
  const nums = values.filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * @param {Array<{voter: string, scores: Record<string, {score: number, reason?: string}>}>} ballots
 * @param {string[]} labels
 */
export function tally(ballots, labels) {
  const byLabel = {};
  for (const label of labels) {
    byLabel[label] = { scores: [], reasons: [] };
  }
  const rejected = [];
  for (const ballot of ballots) {
    if (!ballot || typeof ballot.scores !== "object" || ballot.scores === null) {
      rejected.push({ voter: ballot?.voter ?? "unknown", reason: "missing scores" });
      continue;
    }
    for (const label of labels) {
      const entry = ballot.scores[label];
      const score = entry && Number.isFinite(entry.score) ? entry.score : null;
      if (score === null) continue;
      if (ballot.voter === label) {
        rejected.push({ voter: ballot.voter, reason: `self-score on ${label} ignored` });
        continue;
      }
      byLabel[label].scores.push(score);
      if (entry.reason) byLabel[label].reasons.push(String(entry.reason));
    }
  }
  const ranking = labels
    .map((label) => ({
      label,
      mean: mean(byLabel[label].scores),
      votes: byLabel[label].scores.length,
      reasons: byLabel[label].reasons,
    }))
    .sort((a, b) => {
      const am = a.mean ?? -1;
      const bm = b.mean ?? -1;
      if (bm !== am) return bm - am;
      return a.label.localeCompare(b.label);
    });
  return { ranking, rejected };
}

/**
 * Spread of mean scores. Wide spread means the panel disagreed.
 * @param {Array<{mean: number|null}>} ranking
 */
export function disagreement(ranking) {
  const means = ranking.map((r) => r.mean).filter((n) => n !== null);
  if (means.length < 2) return 0;
  return Math.max(...means) - Math.min(...means);
}

export function confidenceFromSpread(spread) {
  if (spread <= 1) return "high";
  if (spread <= 2.5) return "medium";
  return "low";
}

/**
 * Pair seats with anonymous labels. The map is for the report author only;
 * judges must never receive it.
 */
export function seatMap(seats) {
  return seats.map((seat, i) => ({
    label: labelFor(i),
    id: seat.id,
    model: seat.model,
  }));
}
