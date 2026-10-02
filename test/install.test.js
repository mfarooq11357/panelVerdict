import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv, loadUserEnv } from "../src/envfile.js";
import { mergeConfig, mergeHermesYaml, applyInstall, installPlan } from "../src/install.js";

test("parseEnv ignores comments and does not keep empty values meaningful", () => {
  const parsed = parseEnv("# note\nOPENAI_API_KEY=sk-test\nexport GROQ_API_KEY=\"gsk\"\nEMPTY=\n");
  assert.equal(parsed.OPENAI_API_KEY, "sk-test");
  assert.equal(parsed.GROQ_API_KEY, "gsk");
  assert.equal(parsed.EMPTY, "");
});

test("loadUserEnv fills missing keys and does not override", () => {
  const dir = mkdtempSync(join(tmpdir(), "pv-env-"));
  const file = join(dir, ".panelverdict.env");
  writeFileSync(file, "OPENAI_API_KEY=from-file\nGROQ_API_KEY=gsk-file\n");
  const env = { OPENAI_API_KEY: "already" };
  const applied = loadUserEnv(env, file);
  assert.deepEqual(applied, ["GROQ_API_KEY"]);
  assert.equal(env.OPENAI_API_KEY, "already");
  assert.equal(env.GROQ_API_KEY, "gsk-file");
  rmSync(dir, { recursive: true });
});

test("merge keeps existing cursor servers and is idempotent", () => {
  const launch = { command: "node", args: ["C:/panel/bin/panelverdict-mcp.js"] };
  const once = mergeConfig("mcpServers", '{"mcpServers":{"magic":{"command":"npx"}}}', launch);
  const doc = JSON.parse(once);
  assert.equal(doc.mcpServers.magic.command, "npx");
  assert.equal(doc.mcpServers.panelverdict.command, "node");
  assert.deepEqual(doc.mcpServers.panelverdict.args, launch.args);
  const twice = mergeConfig("mcpServers", once, launch);
  assert.equal(JSON.parse(twice).mcpServers.panelverdict.args.length, 1);
});

test("codex toml append does not duplicate the table", () => {
  const launch = { command: "C:/Program Files/nodejs/node.exe", args: ["C:/panel/mcp.js"] };
  const once = mergeConfig("toml", "[features]\njs_repl = false\n", launch);
  assert.match(once, /\[features\]/);
  assert.match(once, /\[mcp_servers\.panelverdict\]/);
  assert.match(once, /Program Files/);
  const twice = mergeConfig("toml", once, launch);
  assert.equal(twice.match(/\[mcp_servers\.panelverdict\]/g).length, 1);
});

test("hermes yaml appends a server without dropping the model key", () => {
  const launch = { command: "node", args: ["mcp.js"] };
  const once = mergeHermesYaml("model:\n  default: grok\n", launch);
  assert.match(once, /default: grok/);
  assert.match(once, /mcp_servers:\n {2}panelverdict:/);
  const twice = mergeHermesYaml(once, launch);
  assert.equal(twice.match(/panelverdict:/g).length, 1);
});

test("applyInstall writes configs and copies the skill into a temp home", () => {
  const home = mkdtempSync(join(tmpdir(), "pv-home-"));
  const skill = mkdtempSync(join(tmpdir(), "pv-skill-"));
  writeFileSync(join(skill, "SKILL.md"), "---\nname: panelverdict\n---\nuse the panel\n");
  mkdirSync(join(home, ".cursor"), { recursive: true });
  const actions = installPlan({
    home,
    env: { LOCALAPPDATA: join(home, "Local"), APPDATA: join(home, "Roaming"), HERMES_HOME: join(home, "hermes") },
    nodePath: "node",
    scriptPath: "mcp.js",
    clients: ["cursor", "claude"],
  });
  const results = applyInstall(actions, { skillSource: skill });
  assert.equal(results.every((row) => row.status === "installed"), true);
  const cursor = JSON.parse(readFileSync(join(home, ".cursor", "mcp.json"), "utf8"));
  assert.equal(cursor.mcpServers.panelverdict.args[0], "mcp.js");
  assert.match(readFileSync(join(home, ".cursor", "skills", "panelverdict", "SKILL.md"), "utf8"), /use the panel/);
  assert.match(readFileSync(join(home, ".claude.json"), "utf8"), /panelverdict/);
  rmSync(home, { recursive: true });
  rmSync(skill, { recursive: true });
});
