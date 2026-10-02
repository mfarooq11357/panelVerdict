#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runPanel } from "../src/panel.js";
import { renderMarkdown } from "../src/render.js";
import { loadSeats, loadChair, missingKeys } from "../src/config.js";
import { listProviders } from "../src/providers.js";
import { loadUserEnv, defaultEnvPath } from "../src/envfile.js";
import {
  installPlan,
  applyInstall,
  ensureEnvFile,
  renderInstallReport,
  mcpScriptPath,
  clientTargets,
} from "../src/install.js";

const HELP = `panelverdict — one question, several AIs, one verdict

Usage
  panelverdict "your question"
  panelverdict --file question.md
  echo "your question" | panelverdict
  panelverdict providers
  panelverdict install
  panelverdict doctor
  panelverdict --demo

Options
  --file <path>     Read the question from a file
  --json            Print the full report as JSON
  --demo            Run with a fake panel (no API key, no network)
  --client a,b      With install: only these clients (cursor,claude,codex,opencode,gemini,continue,cline,hermes)
  --dry-run         With install: print the plan, write nothing
  --help            Show this help

Seats
  PANELVERDICT_SEATS is a comma list. Each seat is one of:
    id=model
    id=provider:model
    id=model@https://host/v1
    id=provider:model@https://host/v1
  A named provider fills the base URL and reads that provider's own key
  (GROQ_API_KEY, ANTHROPIC_API_KEY, ...). See: panelverdict providers

Environment
  PANELVERDICT_SEATS       seat list (default a=gpt-4o-mini,b=gpt-4o-mini)
  PANELVERDICT_KEY_<ID>    API key for that seat, wins over the provider key
  PANELVERDICT_API_KEY     Fallback key for every seat
  OPENAI_API_KEY           Used if the two above are unset
  PANELVERDICT_CHAIR       provider:model, or a bare model on the first seat's provider
  PANELVERDICT_CHAIR_BASE  Chair base URL override
  PANELVERDICT_CHAIR_KEY   Chair API key

Example
  set PANELVERDICT_SEATS=g=groq:llama-3.3-70b-versatile,c=anthropic:claude-sonnet-4-5,o=openai:gpt-4o-mini
  set GROQ_API_KEY=gsk-...
  set ANTHROPIC_API_KEY=sk-ant-...
  set OPENAI_API_KEY=sk-...
  set PANELVERDICT_CHAIR=openai:gpt-4o-mini

Judges only see anonymous labels. The score table maps labels back afterwards.
Agreement is a cross-check, not proof.
`;

function parseArgs(argv) {
  const out = { json: false, demo: false, help: false, providers: false, install: false, doctor: false, dryRun: false, clients: null, file: null, question: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--demo") out.demo = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "providers") out.providers = true;
    else if (arg === "install") out.install = true;
    else if (arg === "doctor") out.doctor = true;
    else if (arg === "--client") {
      out.clients = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!out.clients.length) throw new Error("--client needs a comma list");
    }
    else if (arg === "--file") {
      out.file = argv[++i];
      if (!out.file) throw new Error("--file needs a path");
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      out.question.push(arg);
    }
  }
  return out;
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function demoComplete(opts) {
  const prompt = opts.prompt;
  if (prompt.startsWith("Answer the question")) {
    const angle = opts.model.includes("b") || opts.model.endsWith("-b") ? "B" : "A";
    const text =
      angle === "A"
        ? "Use a queue with a dead-letter topic. Retry twice with backoff, then park the message and alert. Do not drop it."
        : "Retry forever in-process. A queue is unnecessary overhead for this volume.";
    return Promise.resolve({ text, model: opts.model, usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } });
  }
  if (prompt.startsWith("You are grading")) {
    const text = JSON.stringify({
      scores: {
        A: { score: 8, reason: "Concrete failure path." },
        B: { score: 3, reason: "Retry-forever hides outages." },
      },
    });
    return Promise.resolve({ text, model: opts.model, usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 } });
  }
  const text = JSON.stringify({
    verdict: "Put failed jobs on a queue, retry twice with backoff, then move them to a dead-letter topic and alert. Do not retry forever in-process.",
    dissent: "A minority said an in-process retry loop is enough at low volume. That is only true if a crash cannot lose the job.",
    caveats: ["This demo did not call a model."],
  });
  return Promise.resolve({ text, model: opts.model, usage: { prompt_tokens: 50, completion_tokens: 40, total_tokens: 90 } });
}

function markerExists(name, home, env) {
  const local = env.LOCALAPPDATA || join(home, "AppData", "Local");
  const roaming = env.APPDATA || join(home, "AppData", "Roaming");
  const markers = {
    cursor: join(home, ".cursor"),
    claude: join(home, ".claude"),
    codex: join(home, ".codex"),
    opencode: join(home, ".config", "opencode"),
    gemini: join(home, ".gemini"),
    continue: join(home, ".continue"),
    cline: join(roaming, "Code", "User", "globalStorage", "saoudrizwan.claude-dev"),
    hermes: env.HERMES_HOME || join(local, "hermes"),
  };
  return existsSync(markers[name]);
}

function doctorReport(home, clients) {
  const targets = clientTargets(home, process.env);
  const lines = ["panelverdict doctor", ""];
  lines.push(`node  ${process.execPath}`);
  lines.push(`env   ${defaultEnvPath()}  ${existsSync(defaultEnvPath()) ? "found" : "missing"}`);
  const keys = ["OPENAI_API_KEY", "GROQ_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY"];
  const set = keys.filter((key) => process.env[key]);
  lines.push(`keys  ${set.length ? set.join(", ") : "none set"}`);
  lines.push("");
  for (const name of clients) {
    const file = targets[name]?.config;
    let state = "missing";
    if (file && existsSync(file)) {
      const text = readFileSync(file, "utf8");
      state = text.includes("panelverdict") ? "connected" : "not connected";
    }
    lines.push(`${state.padEnd(14)} ${name}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadUserEnv();
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  if (args.providers) {
    const rows = listProviders();
    if (args.json) {
      process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
      return;
    }
    process.stdout.write("id           key                  wire       base\n");
    for (const row of rows) {
      const id = row.id.padEnd(12);
      const key = row.keyEnv.padEnd(20);
      const wire = (row.wire || "openai").padEnd(10);
      process.stdout.write(`${id} ${key} ${wire} ${row.baseUrl || "(Messages API)"}\n`);
    }
    process.stderr.write(`\n${rows.length} providers. Seat spec: id=provider:model\n`);
    return;
  }
  if (args.install || args.doctor) {
    const home = process.env.USERPROFILE || process.env.HOME;
    const detected = args.clients || Object.keys(clientTargets(home, process.env)).filter((name) => markerExists(name, home, process.env));
    if (args.doctor && !args.install) {
      process.stdout.write(doctorReport(home, detected));
      return;
    }
    const actions = installPlan({
      home,
      env: process.env,
      nodePath: process.execPath,
      scriptPath: mcpScriptPath(),
      clients: detected,
    });
    if (args.dryRun) {
      for (const action of actions) process.stdout.write(`${action.status}  ${action.client}  ${action.path}\n`);
      return;
    }
    const envFile = ensureEnvFile(defaultEnvPath());
    const results = applyInstall(actions);
    process.stdout.write(`${renderInstallReport(results, envFile)}\n`);
    process.stdout.write(`\n${doctorReport(home, detected)}`);
    return;
  }

  let question = args.question.join(" ").trim();
  if (args.file) question = readFileSync(args.file, "utf8").trim();
  if (!question) question = (await readStdin()).trim();
  if (!question && args.demo) {
    question = "A webhook handler sometimes fails. Should we retry in-process or use a queue?";
  }
  if (!question) {
    process.stderr.write("No question. Pass one as an argument, --file, or stdin.\n\n");
    process.stderr.write(HELP);
    process.exitCode = 2;
    return;
  }

  let seats;
  let chair;
  let completeImpl;
  if (args.demo) {
    seats = [
      { id: "seat-a", model: "demo-a", apiKey: "demo" },
      { id: "seat-b", model: "demo-b", apiKey: "demo" },
    ];
    chair = { model: "demo-chair", apiKey: "demo" };
    completeImpl = demoComplete;
  } else {
    seats = loadSeats(process.env);
    chair = loadChair(process.env, seats);
    const missing = missingKeys(seats, chair);
    if (missing.length) {
      process.stderr.write(
        `Missing API key. Set PANELVERDICT_API_KEY or OPENAI_API_KEY (or per-seat PANELVERDICT_KEY_<ID>).\nLooked for: ${missing.join(", ")}\n`,
      );
      process.exitCode = 2;
      return;
    }
  }

  const report = await runPanel({
    question,
    seats,
    chair,
    completeImpl,
    onEvent(event) {
      if (args.json) return;
      if (event.type === "drafts:start") {
        process.stderr.write(`Drafting with ${event.seats.map((s) => s.id).join(", ")}...\n`);
      } else if (event.type === "draft:error") {
        process.stderr.write(`draft ${event.id} failed: ${event.error}\n`);
      } else if (event.type === "judge:start") {
        process.stderr.write("Judging anonymously...\n");
      } else if (event.type === "judge:error") {
        process.stderr.write(`judge ${event.voter} failed: ${event.error}\n`);
      } else if (event.type === "chair:start") {
        process.stderr.write("Writing the verdict...\n");
      }
    },
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderMarkdown(report)}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
