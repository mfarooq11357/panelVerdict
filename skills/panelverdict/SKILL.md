---
name: panelverdict
description: "Use when a coding decision is expensive to get wrong and more than one model should weigh in. Asks a blind panel and returns one verdict plus a minority report."
---

# panelverdict

Use this when the user asks for a second opinion, a panel, or a verdict on a design choice, a risky migration, or two competing plans. Do not use it for a typo, a rename, or a question one model can answer.

## Run it

Prefer the MCP tool `panel_verdict` when this server is connected. Otherwise:

```bash
panelverdict --json "the question, including the constraints"
```

The working directory does not matter. Keys come from the environment, never from the chat.

## Read the result

- `verdict` is the answer to act on.
- `dissent` is the point a minority got right. Do not drop it.
- `confidence` is `high`, `medium`, or `low` from how far the scores spread. Low means the panel disagreed. Say so.
- `ranking` maps anonymous labels back to seats after scoring. Do not treat the winner as proof.

Agreement is a cross-check, not proof. A confident panel can still be wrong together. If the verdict invents a version, a benchmark, or a citation, discard that part.
