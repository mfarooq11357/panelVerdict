import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_TEMPLATE, defaultEnvPath } from "./envfile.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function packageRoot() {
  return ROOT;
}

export function mcpScriptPath() {
  return join(ROOT, "bin", "panelverdict-mcp.js");
}

export function skillSourcePath() {
  return join(ROOT, "skills", "panelverdict");
}

export function launchSpec(nodePath, scriptPath) {
  return {
    type: "stdio",
    command: nodePath,
    args: [scriptPath],
  };
}

/**
 * Where each client keeps user-level config. Paths are under `home` except Hermes,
 * which uses HERMES_HOME or %LOCALAPPDATA%\\hermes.
 */
export function clientTargets(home, env = {}) {
  const local = env.LOCALAPPDATA || join(home, "AppData", "Local");
  const roaming = env.APPDATA || join(home, "AppData", "Roaming");
  const hermesHome = env.HERMES_HOME || join(local, "hermes");
  return {
    cursor: {
      config: join(home, ".cursor", "mcp.json"),
      skill: join(home, ".cursor", "skills", "panelverdict"),
      style: "mcpServers",
    },
    claude: {
      config: join(home, ".claude.json"),
      skill: join(home, ".claude", "skills", "panelverdict"),
      style: "mcpServers",
    },
    codex: {
      config: join(home, ".codex", "config.toml"),
      skill: join(home, ".codex", "skills", "panelverdict"),
      style: "toml",
    },
    opencode: {
      config: join(home, ".config", "opencode", "opencode.json"),
      skill: join(home, ".config", "opencode", "skills", "panelverdict"),
      style: "opencode",
    },
    gemini: {
      config: join(home, ".gemini", "settings.json"),
      skill: join(home, ".gemini", "skills", "panelverdict"),
      style: "mcpServers",
    },
    continue: {
      config: join(home, ".continue", "config.json"),
      skill: join(home, ".continue", "skills", "panelverdict"),
      style: "continue",
    },
    cline: {
      config: join(roaming, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      skill: null,
      style: "mcpServers",
    },
    hermes: {
      config: join(hermesHome, "config.yaml"),
      skill: join(hermesHome, "skills", "panelverdict"),
      style: "hermes",
    },
  };
}

export function mergeConfig(style, existing, launch) {
  if (style === "toml") return mergeCodexToml(existing, launch);
  if (style === "hermes") return mergeHermesYaml(existing, launch);
  const doc = existing && existing.trim() ? JSON.parse(existing) : {};
  if (style === "opencode") {
    doc.mcp = doc.mcp && typeof doc.mcp === "object" ? doc.mcp : {};
    doc.mcp.panelverdict = {
      type: "local",
      command: [launch.command, ...launch.args],
      enabled: true,
    };
    return `${JSON.stringify(doc, null, 2)}\n`;
  }
  if (style === "continue") {
    const list = Array.isArray(doc.mcpServers) ? doc.mcpServers : [];
    doc.mcpServers = list.filter((item) => item?.name !== "panelverdict");
    doc.mcpServers.push({ name: "panelverdict", command: launch.command, args: launch.args });
    return `${JSON.stringify(doc, null, 2)}\n`;
  }
  doc.mcpServers = doc.mcpServers && typeof doc.mcpServers === "object" ? doc.mcpServers : {};
  doc.mcpServers.panelverdict = {
    type: "stdio",
    command: launch.command,
    args: launch.args,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function mergeCodexToml(existing, launch) {
  const block = [
    "[mcp_servers.panelverdict]",
    `command = ${tomlString(launch.command)}`,
    `args = [${launch.args.map(tomlString).join(", ")}]`,
    "",
  ].join("\n");
  const text = existing || "";
  if (/^\[mcp_servers\.panelverdict\]/m.test(text)) {
    return text.replace(/\[mcp_servers\.panelverdict\][\s\S]*?(?=\n\[|\s*$)/, `${block.trim()}\n`);
  }
  const sep = text.trim() ? "\n\n" : "";
  return `${text.replace(/\s*$/, "")}${sep}${block}`;
}

export function mergeHermesYaml(existing, launch) {
  const child = [
    "  panelverdict:",
    `    command: ${yamlString(launch.command)}`,
    "    args:",
    ...launch.args.map((arg) => `      - ${yamlString(arg)}`),
  ].join("\n");
  const text = existing || "";
  if (/^  panelverdict:/m.test(text)) return text.endsWith("\n") ? text : `${text}\n`;
  if (/^mcp_servers:\s*$/m.test(text)) {
    return text.replace(/^mcp_servers:\s*$/m, `mcp_servers:\n${child}`);
  }
  const sep = text.trim() ? "\n" : "";
  return `${text.replace(/\s*$/, "")}${sep}mcp_servers:\n${child}\n`;
}

function tomlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function yamlString(value) {
  if (/[:#'"\n]/.test(value) || value.includes("\\")) return JSON.stringify(value);
  return value;
}

export function installPlan({ home, env, nodePath, scriptPath, clients, exists }) {
  const targets = clientTargets(home, env);
  const launch = launchSpec(nodePath, scriptPath);
  const chosen = clients?.length ? clients : Object.keys(targets);
  const actions = [];
  for (const name of chosen) {
    const target = targets[name];
    if (!target) throw new Error(`unknown client: ${name}`);
    if (exists && !exists(target.config) && name !== "cursor" && name !== "claude" && name !== "codex" && name !== "gemini" && name !== "hermes") {
      actions.push({ client: name, status: "skipped", reason: "not installed", path: target.config });
      continue;
    }
    actions.push({
      client: name,
      status: "write",
      path: target.config,
      style: target.style,
      launch,
      skill: target.skill,
    });
  }
  return actions;
}

/**
 * Write configs and copy the skill. Does not put API keys in agent config.
 * The server reads ~/.panelverdict.env itself.
 */
export function applyInstall(actions, opts = {}) {
  const skillFrom = opts.skillSource || skillSourcePath();
  const written = [];
  for (const action of actions) {
    if (action.status !== "write") {
      written.push(action);
      continue;
    }
    mkdirSync(dirname(action.path), { recursive: true });
    if (!action.skipConfig) {
      const existing = existsSync(action.path) ? readFileSync(action.path, "utf8") : "";
      const next = mergeConfig(action.style, existing, action.launch);
      writeFileSync(action.path, next);
    }
    if (action.skill) {
      mkdirSync(dirname(action.skill), { recursive: true });
      cpSync(skillFrom, action.skill, { recursive: true });
    }
    written.push({ ...action, status: "installed" });
  }
  return written;
}

export function ensureEnvFile(file = defaultEnvPath()) {
  if (existsSync(file)) return { path: file, created: false };
  writeFileSync(file, ENV_TEMPLATE);
  return { path: file, created: true };
}

export function renderInstallReport(results, envFile) {
  const lines = ["panelverdict install", ""];
  if (envFile) {
    lines.push(envFile.created ? `Created ${envFile.path}` : `Keys file already exists: ${envFile.path}`);
    lines.push("Put provider keys in that file. Agents do not need a copy.");
    lines.push("");
  }
  for (const row of results) {
    if (row.status === "skipped") lines.push(`skip  ${row.client}  ${row.reason}`);
    else lines.push(`ok    ${row.client}  ${row.path}`);
  }
  lines.push("");
  lines.push("Restart the agent. Ask it to call panel_verdict.");
  return lines.join("\n");
}
