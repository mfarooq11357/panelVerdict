# panelverdict

Ask several models the same question. Hide who wrote what. Get **one verdict**, and the point a minority got right.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-stdio-black.svg)](#add-it-to-an-agent)

A confident panel can still be wrong together. The report says so. This is a cross-check, not proof.

## What it does

1. Each model drafts an answer on its own.
2. Drafts are labeled A, B, C. Model names are stripped.
3. Each model scores the others. It cannot score itself.
4. A chair that did not vote writes one verdict and a minority report.

Use it for a decision you do not want one model to make alone: a migration, a cache design, a retry policy, two competing plans. It is not a gateway and not a token compressor.

## Add it to an agent

```bash
node bin/panelverdict.js install
```

That registers the MCP tool `panel_verdict` with every agent it finds: Claude Code, Cursor, Codex, Gemini CLI, OpenCode, Continue, Cline, and Hermes. It also copies the skill file. Keys stay in one file, `~/.panelverdict.env`. They are not copied into agent config.

Restart the agent, then ask it to call `panel_verdict`.

```bash
node bin/panelverdict.js doctor
```

Opening this repo is enough for Claude Code and Cursor inside it. `.mcp.json` and `.cursor/mcp.json` already point at the server.

## Try it with no key

```bash
node bin/panelverdict.js --demo
```

No network. No API key. You get the same verdict shape a real run returns.

## Real run

Node 18 or newer. No runtime dependencies.

```bash
npm install -g panelverdict
panelverdict "Should this webhook retry in-process or go through a queue?"
```

From this checkout, before the package is on npm:

```bash
node bin/panelverdict.js "Should this webhook retry in-process or go through a queue?"
```

A mixed panel is the useful case. Each seat is `id=provider:model`.

```bash
set PANELVERDICT_SEATS=g=groq:llama-3.3-70b-versatile,c=anthropic:claude-sonnet-4-5,o=openai:gpt-4o-mini
set GROQ_API_KEY=gsk-...
set ANTHROPIC_API_KEY=sk-ant-...
set OPENAI_API_KEY=sk-...
set PANELVERDICT_CHAIR=openai:gpt-4o-mini
panelverdict "Which of these two cache designs fails closed?"
```

On PowerShell, use `$env:NAME = "value"`. Or put the same lines in `~/.panelverdict.env`. The CLI and the MCP server both read that file, and neither overrides a key already set in the environment.

`panelverdict providers` lists the built-in names. A URL that is not in the list still works: `id=model@https://host/v1`.

## What you get

| Field | Meaning |
| --- | --- |
| verdict | The answer to act on |
| dissent | What a minority got right |
| confidence | `high`, `medium`, or `low`, from how far the scores spread |
| ranking | Label, seat, model, mean score. Mapped back only after judging |

Add `--json` for the full report. Progress goes to stderr, so piping stdout stays clean.

| Spread | Confidence |
| --- | --- |
| 1 or less | high |
| up to 2.5 | medium |
| more than 2.5 | low. Read the dissent |

You need at least two successful drafts. A dead seat is skipped. A seat cannot score itself. If every judge fails, the run fails instead of inventing a score.

## Providers

| id | Key | Wire |
| --- | --- | --- |
| openai | `OPENAI_API_KEY` | Chat completions |
| groq | `GROQ_API_KEY` | Chat completions |
| openrouter | `OPENROUTER_API_KEY` | Chat completions |
| together | `TOGETHER_API_KEY` | Chat completions |
| fireworks | `FIREWORKS_API_KEY` | Chat completions |
| deepseek | `DEEPSEEK_API_KEY` | Chat completions |
| mistral | `MISTRAL_API_KEY` | Chat completions |
| xai | `XAI_API_KEY` | Chat completions |
| gemini | `GEMINI_API_KEY` | Gemini OpenAI-compatible endpoint |
| cerebras | `CEREBRAS_API_KEY` | Chat completions |
| deepinfra | `DEEPINFRA_API_KEY` | Chat completions |
| nvidia | `NVIDIA_API_KEY` | Chat completions |
| perplexity | `PERPLEXITY_API_KEY` | Chat completions |
| moonshot | `MOONSHOT_API_KEY` | Chat completions |
| qwen | `DASHSCOPE_API_KEY` | DashScope international |
| ollama | `OLLAMA_API_KEY` | Local |
| lmstudio | `LMSTUDIO_API_KEY` | Local |
| vllm | `VLLM_API_KEY` | Local |
| anthropic | `ANTHROPIC_API_KEY` | Claude Messages API |

Key order, first match wins: `PANELVERDICT_KEY_<ID>`, then that provider's own variable, then `PANELVERDICT_API_KEY`, then `OPENAI_API_KEY`.

The chair is a separate call, so it does not vote on a draft it wrote. Set `PANELVERDICT_CHAIR=provider:model`. At most six seats.

## Connect by hand

`panelverdict install` does this. Use these only if you want to edit a config yourself. The tool name is `panel_verdict`. The command is `panelverdict-mcp`, or `node bin/panelverdict-mcp.js` from this repo.

**Claude Code**

```bash
claude mcp add --scope user panelverdict -- panelverdict-mcp
```

**Cursor** — `%USERPROFILE%\.cursor\mcp.json`

```json
{
  "mcpServers": {
    "panelverdict": {
      "command": "panelverdict-mcp"
    }
  }
}
```

**Codex**

```bash
codex mcp add panelverdict -- panelverdict-mcp
```

**Claude Desktop** — `%APPDATA%\Claude\claude_desktop_config.json`, then quit and reopen.

**OpenCode** — `opencode.json`

```json
{
  "mcp": {
    "panelverdict": {
      "type": "local",
      "command": ["panelverdict-mcp"],
      "enabled": true
    }
  }
}
```

**Continue** — `~/.continue/config.json`, `mcpServers` is an array with `name` and `command`.

**Cline** — same `mcpServers` object as Cursor, in `cline_mcp_settings.json`.

**Gemini CLI** — add a stdio server named `panelverdict` whose command is `panelverdict-mcp`.

**Hermes** — `panelverdict install` writes `mcp_servers.panelverdict` and copies the skill. Restart Hermes.

Any other MCP client: launch `panelverdict-mcp` with no arguments. Stdio, JSON-RPC, newline-delimited.

The skill at `skills/panelverdict/SKILL.md` tells an agent when to call the panel and not to drop the dissent. Copy that folder to `.claude/skills/panelverdict/` or the client's skills directory.

## Programmatic use

```js
import { runPanel } from "./src/panel.js";

const report = await runPanel({
  question: "Is this migration safe to run online?",
  seats: [
    { id: "a", model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY },
    {
      id: "b",
      model: "llama-3.3-70b-versatile",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
    },
  ],
  chair: { model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY },
});
```

Set `wire: "anthropic"` on a seat to use the Claude Messages API.

## Tests

```bash
npm test
```

## License

MIT. Copyright (c) 2026 Muhammad Farooq.
