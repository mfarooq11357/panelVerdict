export function draftPrompt(question) {
  return [
    "Answer the question below for a developer.",
    "Be concrete. Prefer a direct recommendation over a survey of options.",
    "If you are unsure, say what is uncertain. Do not invent citations, version numbers, or benchmarks.",
    "Reply in plain markdown. No preamble.",
    "",
    "Question:",
    question,
  ].join("\n");
}

export function judgePrompt(question, drafts) {
  const blocks = drafts
    .map((d) => `=== Answer ${d.label} ===\n${d.text}`)
    .join("\n\n");
  return [
    "You are grading anonymous answers to the same question.",
    "You do not know which model wrote which answer. Do not guess.",
    "Score each answer from 1 to 10 on correctness, specificity, and whether a developer could act on it.",
    "Penalize invented facts, vague advice, and answers that dodge the question.",
    "Return ONLY a JSON object with this shape:",
    '{"scores":{"A":{"score":8,"reason":"one sentence"},"B":{"score":5,"reason":"one sentence"}}}',
    "Include every label shown below. Scores must be integers 1-10.",
    "",
    "Question:",
    question,
    "",
    blocks,
  ].join("\n");
}

export function chairPrompt(question, drafts, ranking) {
  const blocks = drafts
    .map((d) => `=== Answer ${d.label} (panel mean ${fmt(ranking, d.label)}) ===\n${d.text}`)
    .join("\n\n");
  return [
    "You are the chair of a small panel. Write the final answer a developer should use.",
    "Use the strongest parts of the higher-scored answers. Do not average them into mush.",
    "If the panel disagreed on a material point, say so in the dissent field instead of hiding it.",
    "Do not invent citations, version numbers, or benchmarks that were not in the answers.",
    "Return ONLY a JSON object:",
    '{"verdict":"markdown answer","dissent":"what a minority got right, or empty string","caveats":["short caution"]}',
    "",
    "Question:",
    question,
    "",
    blocks,
  ].join("\n");
}

function fmt(ranking, label) {
  const row = ranking.find((r) => r.label === label);
  if (!row || row.mean === null) return "n/a";
  return row.mean.toFixed(1);
}
