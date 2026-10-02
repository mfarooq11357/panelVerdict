# panelverdict

Ask several models the same question. Hide who wrote what. Have them score each other. Return **one verdict** and a minority report.

This is a small MIT CLI for developers who already have more than one model and do not want to diff the answers by hand. It is not a router, not a token compressor, and not a claim that the panel is right. A confident panel can still be wrong together. The report says so.

## Install

```bash
npm install -g panelverdict
```

Or from a checkout:

```bash
node bin/panelverdict.js --help
```

Requires Node 18 or newer. No runtime dependencies.

## Try it with no key

```bash
panelverdict --demo
```

That runs the full pipeline against a fake panel so you can see the verdict shape.

## Real run

```bash
set OPENAI_API_KEY=sk-...
panelverdict "Should this webhook retry in-process or go through a queue?"
```

On PowerShell, use `$env:OPENAI_API_KEY = "sk-..."`.

Different providers on one panel. `panelverdict providers` lists the built-in names.

```bash
set PANELVERDICT_SEATS=g=groq:llama-3.3-70b-versatile,c=anthropic:claude-sonnet-4-5,o=openai:gpt-4o-mini
set GROQ_API_KEY=gsk-...
set ANTHROPIC_API_KEY=sk-ant-...
set OPENAI_API_KEY=sk-...
set PANELVERDICT_CHAIR=openai:gpt-4o-mini
panelverdict "Which of these two cache designs fails closed?"
```

Seat spec is `id=provider:model`, or `id=model@https://host/v1` for a URL that is not in the list. A seat key is `PANELVERDICT_KEY_<ID>`, then that provider's own variable (`GROQ_API_KEY`, `ANTHROPIC_API_KEY`, ...), then `PANELVERDICT_API_KEY`, then `OPENAI_API_KEY`.

Claude uses the Messages API. Every other named provider uses OpenAI chat completions at that provider's base URL.

## What you get

- A markdown verdict on stdout (or `--json` for the full report).
- Anonymous labels (`A`, `B`, `C`) during judging. Models are not told who wrote a draft.
- Self-scores are dropped.
- A dead seat is skipped if at least two drafts succeed.
- A score spread: tight spread is `high` confidence, wide spread is `low`.
- A dissent field for the point the minority got right.
- Token totals, so you can see what the panel cost.

## How it differs

| Tool | What it optimizes |
| --- | --- |
| OmniRoute, 9router | One endpoint, many providers, fewer tokens, keep coding when a quota dies |
| graphify | Turn a folder into a knowledge graph the assistant can query |
| quorum-ai, Concilium, LLMSwap | Multi-model debate or synthesis, usually via their own provider SDKs |
| **panelverdict** | Blind scoring across named providers, one verdict, minority report, zero dependencies |

## Programmatic use

```js
import { runPanel } from "panelverdict/src/panel.js";

const report = await runPanel({
  question: "Is this migration safe to run online?",
  seats: [
    { id: "a", model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY },
    { id: "b", model: "local", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "ollama" },
  ],
  chair: { model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY },
});
```

The package exports files, not a bundler entry. Import from the files above, or shell out to the CLI.

## Tests

```bash
npm test
```

## License

MIT © Muhammad Farooq
