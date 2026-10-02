import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Parse a .env file. Comments and blank lines are ignored. Quotes are stripped. */
export function parseEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let key = trimmed.slice(0, eq).trim();
    if (key.startsWith("export ")) key = key.slice(7).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function defaultEnvPath(env = process.env) {
  if (env.PANELVERDICT_ENV_FILE) return env.PANELVERDICT_ENV_FILE;
  const home = env.USERPROFILE || env.HOME || homedir();
  return join(home, ".panelverdict.env");
}

/**
 * Fill empty keys from the env file. Never overwrites a key that is already set.
 * Returns the names that were filled. Missing file is not an error.
 */
export function loadUserEnv(target = process.env, file = defaultEnvPath(target)) {
  if (!file || !existsSync(file)) return [];
  const parsed = parseEnv(readFileSync(file, "utf8"));
  const applied = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (!value) continue;
    if (target[key]) continue;
    target[key] = value;
    applied.push(key);
  }
  return applied;
}

export const ENV_TEMPLATE = `# panelverdict keys. One file for every agent.
# The CLI and the MCP server read this file. They do not override keys already set in the environment.
# Seat spec: id=provider:model
PANELVERDICT_SEATS=g=groq:llama-3.3-70b-versatile,c=anthropic:claude-sonnet-4-5,o=openai:gpt-4o-mini
PANELVERDICT_CHAIR=openai:gpt-4o-mini

OPENAI_API_KEY=
GROQ_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
OPENROUTER_API_KEY=
MISTRAL_API_KEY=
XAI_API_KEY=
`;
