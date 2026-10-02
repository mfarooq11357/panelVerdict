export function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Verdict`);
  lines.push("");
  lines.push(`**Confidence:** ${report.confidence} (score spread ${report.spread})`);
  if (report.winner?.seat) {
    lines.push(
      `**Highest-scored draft:** ${report.winner.label} · ${report.winner.seat.id} (${report.winner.seat.model}) · mean ${report.winner.mean}`,
    );
  }
  lines.push("");
  lines.push(report.verdict);
  lines.push("");
  if (report.dissent) {
    lines.push(`## Minority report`);
    lines.push("");
    lines.push(report.dissent);
    lines.push("");
  }
  if (report.caveats?.length) {
    lines.push(`## Caveats`);
    lines.push("");
    for (const c of report.caveats) lines.push(`- ${c}`);
    lines.push("");
  }
  lines.push(`## Panel scores`);
  lines.push("");
  lines.push(`| Label | Seat | Model | Mean | Votes |`);
  lines.push(`| --- | --- | --- | --- | --- |`);
  for (const row of report.ranking) {
    const id = row.seat?.id ?? "";
    const model = row.seat?.model ?? "";
    const mean = row.mean === null ? "n/a" : String(row.mean);
    lines.push(`| ${row.label} | ${id} | ${model} | ${mean} | ${row.votes} |`);
  }
  lines.push("");
  if (report.judgeErrors?.length) {
    lines.push(`## Judge failures`);
    lines.push("");
    for (const e of report.judgeErrors) lines.push(`- ${e.voter}: ${e.error}`);
    lines.push("");
  }
  const u = report.usage;
  if (u) {
    lines.push(
      `Tokens: ${u.total_tokens} total across ${u.calls} calls (${u.prompt_tokens} in, ${u.completion_tokens} out).`,
    );
  }
  lines.push("");
  lines.push(
    "Agreement is a cross-check, not proof. A confident panel can still be wrong together.",
  );
  return lines.join("\n");
}
