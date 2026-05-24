# PiecePool LLM-Wiki Implementation Strategy

## Goal

PiecePool should evolve from a simple collection dashboard into a living wiki system:

1. Raw sources are preserved as immutable evidence.
2. The wiki layer is a set of Markdown pages maintained by an LLM.
3. A schema layer defines ingestion, indexing, logging, linting, and human review rules.
4. The UI exposes not only stored pieces, but also isolated nodes and human-driven connection work.

This document translates `llm-wki.md` into implementation-oriented architecture.

## Filesystem Interface

```txt
raw/
  README.md
  assets/
wiki/
  index.md
  log.md
  pages/
schema/
  wiki-schema.md
```

### `raw/`

- Stores original source material.
- Treated as read-only after ingestion.
- LLM agents may read files and cite them, but must not mutate them.
- Future backend API should expose read/list operations only.

### `wiki/index.md`

- Content map for all wiki pages.
- Updated after each ingest or meaningful query.
- UI can parse this into page cards, source counts, tags, and graph nodes.

### `wiki/log.md`

- Timeline of ingest, query, lint, and connection events.
- Must use parseable headings:

```md
## [2026-05-25] ingest | Operating Systems Week 5 PDF
```

### `schema/wiki-schema.md`

- Rules for how the LLM may read raw sources, update wiki pages, update `index.md`, append `log.md`, and propose human review tasks.

## Data Flow

1. User adds source to `raw/`.
2. Ingest runner reads raw source and relevant wiki pages.
3. LLM proposes new or updated Markdown pages.
4. Human confirms emphasis and corrections.
5. System writes changed wiki pages, updates `wiki/index.md`, appends `wiki/log.md`.
6. Lint job detects isolated pages, stale pages, missing references, and unresolved contradictions.
7. Human uses PiecePool UI to approve or reject semantic connections.

## Frontend Integration

The current MVP should keep mock data, but model these concepts explicitly:

- Raw source inventory
- Wiki page inventory
- Log timeline
- Lint findings
- Human connection candidates

The Graph View should treat every wiki item as a node, while connection candidates remain human-review tasks until accepted.

## Backend Integration Later

Minimal backend surface:

- `GET /api/wiki/raw`
- `GET /api/wiki/index`
- `GET /api/wiki/log`
- `POST /api/wiki/ingest`
- `POST /api/wiki/connections`
- `POST /api/wiki/lint`

Do not introduce vector DB or embedding infrastructure until Markdown indexing and lint workflows become insufficient.

## TODO

- Add a local file adapter for reading `raw/`, `wiki/index.md`, and `wiki/log.md`.
- Add a write adapter for wiki pages, `index.md`, and `log.md`.
- Add a human approval flow before writing LLM-proposed semantic connections.
