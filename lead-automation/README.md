# Gahonsh Lead-to-Sales Automation

A local, idempotent pipeline that finds small businesses with a weak web
presence, scores them, and writes a consultation-first outreach **draft**. It
never sends email and never builds a website by itself. Both are owner actions.

## The four-step sales rule this repo encodes

1. Find a business and record the specific gap (no site, dead site, not mobile).
2. Ask for their requirements and budget. Do not quote a price yet.
3. Only after interest and a stated budget, produce a wireframe and a fixed quote.
4. Agree payment terms before any build work starts.

`src/draft.mjs` is the only place that writes prose, and its output is a draft
with `sent: false` and `requiresApproval: true`. There is no send path in this
codebase at all.

## Pipeline

```
discover (OpenStreetMap Overpass, no API key)
   -> audit (HTTPS, reachable, viewport meta, load time)
   -> score (explainable 0-100, threshold 55)
   -> draft (pending approval row)
```

Each city is marked processed in `lead_runs`, so a repeated run skips it. A run
also stops at a time budget, which is what a scheduled job needs.

## Markets

Primary market is **USA**. `src/config.mjs` holds 37 cities across the USA,
Canada, UK, Australia, UAE, Singapore and Europe, and 10 business categories
that buy booking systems, menus and back-office tooling.

## Run it

```bash
npm test                                  # 14 tests, offline
node src/cli.mjs pipeline --market USA --cities 2 --budget 90000
```

Production wires `PostgresStore` to Supabase (`DATABASE_URL`). `MemoryStore` is
used by tests and dry runs and mirrors the same upsert semantics: a later sparse
record never erases a phone, email or website that was already found.

## The timestamp bug this repo fixes

Postgres rejects `''` for `timestamptz`, and one empty string used to abort a
whole run after discovery had already succeeded. `normaliseTimestamps()` converts
empty or unparseable values to `null` before every write, and a test pins it.

## Files

```
src/config.mjs    37 cities, 10 categories, primary market
src/discover.mjs  Overpass query builder, normaliser, dedupe
src/audit.mjs     three-signal website audit
src/score.mjs     explainable qualification score
src/draft.mjs     consultation-first draft, never sent
src/store.mjs     memory + Postgres adapters, timestamp normaliser
src/pipeline.mjs  budgeted, idempotent orchestrator
src/cli.mjs       command line entry
docs/WORKFLOW.md  how it runs on a schedule
```

## Guardrails

- No SMTP, no Gmail client, no send function anywhere in this repo.
- Drafts require approval before they leave the queue.
- `reply STOP` line in every draft, and the address is never re-contacted after
  an opt-out.
- Only public directory data (OpenStreetMap) is used for discovery.
