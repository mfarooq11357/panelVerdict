# panelverdict

panelverdict asks several models the same question, hides who wrote each answer, has them score each other, and returns **one verdict** plus a minority report.

It is a small MIT tool for a decision you do not want a single model to make alone: a migration, a cache design, a retry policy, a review of two plans. It is not a gateway, not a token compressor, and not a claim that the panel is right. A confident panel can still be wrong together. The report says so.

You can run it from the terminal, or connect it to Claude Code, Cursor, Codex, OpenCode, Cline, Continue, Gemini CLI, or any other client that speaks MCP.

## Install

Node 18 or newer. No runtime dependencies.

```bash
npm install -g panelverdict
```

From a checkout of this repo, the same commands work without installing:

```bash
node bin/panelverdict.js --help
node bin/panelverdict-mcp.js
```

## Try it with no key

```bash
panelverdict --demo
```

That runs the full pipeline against a fake panel so you can see the verdict shape. It does not call a provider.

## What a run does

1. Each seat drafts an answer on its own. Seats do not see each other.
2. Surviving drafts are labeled A, B, C. Model names are stripped before judging.
3. Each seat scores the other drafts. A seat cannot score itself. A seat that fails to return JSON is dropped, not treated as a zero.
4. A chair, which did not vote, writes one verdict and a dissent field for the point a minority got right.
5. The score table maps labels back to seats only after judging.

You need at least two successful drafts. A dead seat is skipped. If every judge fails, the run fails instead of inventing a score.

Confidence is the spread between the highest and lowest mean score:

| Spread | Confidence | What it means |
| --- | --- | --- |
| 1 or less | high | The panel scored the drafts close together |
| more than 1, up to 2.5 | medium | Some disagreement |
| more than 2.5 | low | The panel did not agree. Read the dissent |

Agreement is a cross-check, not proof.

## Providers

`panelverdict providers` prints the built-in list. Each seat can use a different one.

| id | Key variable | Wire |
| --- | --- | --- |
| openai | OPENAI_API_KEY | OpenAI chat completions |
| groq | GROQ_API_KEY | OpenAI chat completions |
| openrouter | OPENROUTER_API_KEY | OpenAI chat completions |
| together | TOGETHER_API_KEY | OpenAI chat completions |
| fireworks | FIREWORKS_API_KEY | OpenAI chat completions |
| deepseek | DEEPSEEK_API_KEY | OpenAI chat completions |
| mistral | MISTRAL_API_KEY | OpenAI chat completions |
| xai | XAI_API_KEY | OpenAI chat completions |
| gemini | GEMINI_API_KEY | OpenAI-compatible Gemini endpoint |
| cerebras | CEREBRAS_API_KEY | OpenAI chat completions |
| deepinfra | DEEPINFRA_API_KEY | OpenAI chat completions |
| nvidia | NVIDIA_API_KEY | OpenAI chat completions |
| perplexity | PERPLEXITY_API_KEY | OpenAI chat completions |
| moonshot | MOONSHOT_API_KEY | OpenAI chat completions |
| qwen | DASHSCOPE_API_KEY | DashScope international compatible mode |
| ollama | OLLAMA_API_KEY | Local OpenAI-compatible server |
| lmstudio | LMSTUDIO_API_KEY | Local OpenAI-compatible server |
| vllm | VLLM_API_KEY | Local OpenAI-compatible server |
| anthropic | ANTHROPIC_API_KEY | Claude Messages API, not the OpenAI shape |

A provider that is not in this table still works if it speaks OpenAI chat completions. Put the base URL in the seat spec.

## CLI

```bash
panelverdict "Should this webhook retry in-process or go through a queue?"
panelverdict --file question.md
panelverdict --json "question"
panelverdict providers
panelverdict --demo
panelverdict --help
```

On Windows `cmd`, `set` works as written below. In PowerShell, use `$env:NAME = "value"`.

One provider, two seats:

```bash
set OPENAI_API_KEY=sk-...
panelverdict "question"
```

A mixed panel is the useful case. Each name is `id=provider:model`.

```bash
set PANELVERDICT_SEATS=g=groq:llama-3.3-70b-versatile,c=anthropic:claude-sonnet-4-5,o=openai:gpt-4o-mini
set GROQ_API_KEY=gsk-...
set ANTHROPIC_API_KEY=sk-ant-...
set OPENAI_API_KEY=sk-...
set PANELVERDICT_CHAIR=openai:gpt-4o-mini
panelverdict "Which of these two cache designs fails closed?"
```

A URL that is not in the table:

```bash
set PANELVERDICT_SEATS=local=qwen2.5@http://127.0.0.1:11434/v1,o=openai:gpt-4o-mini
set PANELVERDICT_KEY_LOCAL=ollama
set OPENAI_API_KEY=sk-...
```

Key order for a seat, first match wins:

1. `PANELVERDICT_KEY_<ID>` (the seat id, uppercased, non-letters become `_`)
2. That provider's own variable, such as `GROQ_API_KEY`
3. `PANELVERDICT_API_KEY`
4. `OPENAI_API_KEY`

The chair is a separate call, so it does not vote on a draft it wrote. Set it with `PANELVERDICT_CHAIR=provider:model`. A bare model name uses OpenAI. `PANELVERDICT_CHAIR_BASE` and `PANELVERDICT_CHAIR_KEY` override that.

At most six seats. Fewer than two is an error.

## What you get

Markdown on stdout, or `--json` for the full report.

- `verdict` — the answer to act on
- `dissent` — what a minority got right. Empty if there was nothing worth keeping
- `caveats` — short cautions from the chair
- `confidence` and `spread`
- `ranking` — label, seat, model, mean score, vote count
- token totals across the calls that succeeded

Progress (who is drafting, who failed) goes to stderr, so piping stdout stays clean.

## Connect an agent

The MCP server speaks stdio. It exposes one tool, `panel_verdict`, with one argument, `question`. Put API keys in the server `env` block. Do not put keys in the tool call, and do not commit them.

The command below assumes a global install. From a checkout, use `node` and the full path to `bin/panelverdict-mcp.js` instead of `panelverdict-mcp`.

### Claude Code

```bash
claude mcp add --scope user panelverdict -- panelverdict-mcp
```

That registers it for you, in every project. To share a secret-free command with a repo, add `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "panelverdict": {
      "command": "panelverdict-mcp",
      "args": []
    }
  }
}
```

Set the keys in your own environment before launching `claude`. Claude Code asks before it uses a project server from `.mcp.json`.

### Cursor

Global config is `%USERPROFILE%\.cursor\mcp.json` on Windows, `~/.cursor/mcp.json` on macOS and Linux. Project config is `.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "panelverdict": {
      "command": "panelverdict-mcp",
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "GROQ_API_KEY": "gsk-...",
        "PANELVERDICT_SEATS": "g=groq:llama-3.3-70b-versatile,o=openai:gpt-4o-mini",
        "PANELVERDICT_CHAIR": "openai:gpt-4o-mini"
      }
    }
  }
}
```

Reload MCP after saving. Do not commit this file if it contains keys.

### Codex CLI

```bash
codex mcp add panelverdict -- panelverdict-mcp
```

### Claude Desktop

Edit the developer config. On Windows that is `%APPDATA%\Claude\claude_desktop_config.json`. Quit Claude fully, then reopen it.

```json
{
  "mcpServers": {
    "panelverdict": {
      "command": "panelverdict-mcp"
    }
  }
}
```

### OpenCode

In `opencode.json` at the project root, or `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "panelverdict": {
      "type": "local",
      "command": ["panelverdict-mcp"],
      "enabled": true
    }
  }
}
```

### Cline

Cline stores servers in `cline_mcp_settings.json` under VS Code's global storage. The shape is the same `mcpServers` object Cursor uses. Add the `panelverdict` entry there.

### Continue

`~/.continue/config.json` uses an array:

```json
{
  "mcpServers": [
    {
      "name": "panelverdict",
      "command": "panelverdict-mcp"
    }
  ]
}
```

### Gemini CLI

Add a stdio server named `panelverdict` whose command is `panelverdict-mcp`, in `.gemini/settings.json` for one project or the user settings for all of them. Then `/mcp` should list it.

### Any other MCP client

If the client can launch a local process, point it at `panelverdict-mcp` with no arguments. The protocol is MCP over stdio, JSON-RPC 2.0, `Content-Length` frames. The tool name is `panel_verdict`.

### Skill file

`skills/panelverdict/SKILL.md` tells an agent when to call the panel and how to read the dissent. Copy that folder to:

| Client | Path |
| --- | --- |
| Claude Code, this repo | `.claude/skills/panelverdict/` |
| Claude Code, you only | `%USERPROFILE%\.claude\skills\panelverdict\` |
| Cursor and other clients that read the same layout | `.cursor/skills/panelverdict/` or the client's skills directory |

Commit the project copy if you want teammates to get the same instruction. Do not commit keys with it.

## Programmatic use

```js
import { runPanel } from "panelverdict/src/panel.js";

const report = await runPanel({
  question: "Is this migration safe to run online?",
  seats: [
    { id: "a", model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY },
    { id: "b", model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY },
  ],
  chair: { model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY },
});
```

Set `wire: "anthropic"` on a seat to use the Claude Messages API. The package has no bundler entry. Import from the file above, or shell out to the CLI.

## Tests

```bash
npm test
```

## License

MIT. Copyright (c) 2026 Muhammad Farooq.
