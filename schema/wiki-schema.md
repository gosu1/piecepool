# PiecePool Wiki Schema

## Layers

1. `raw/` contains immutable source material.
2. `wiki/` contains LLM-maintained Markdown knowledge pages.
3. `schema/` contains operating rules for LLM maintenance.

## Ingest Rules

- Read raw source.
- Identify relevant existing wiki pages.
- Propose changes before writing.
- Update `wiki/index.md`.
- Append one parseable event to `wiki/log.md`.

## Query Rules

- Read `wiki/index.md` first.
- Use relevant pages and raw sources only when needed.
- Save durable discoveries as wiki updates instead of leaving them in chat.

## Lint Rules

Check for:
- Isolated pages
- Missing backlinks
- Stale summaries
- Missing raw references
- Contradictions between pages
- Human-review connection candidates

## Human Connection Rule

The system may propose semantic connections, but the final relationship is approved by a human.
