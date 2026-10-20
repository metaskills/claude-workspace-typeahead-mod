# CLAUDE.md

This is a Claude workspace: a home folder for the analyses, plans, decks and notes you work on with Claude Code. Start `claude` here, or point the workspace plugins at it with `CLAUDE_WORKSPACE_DIR`.

## Projects

Each project lives in its own `./projects/` folder with its own `CLAUDE.md` holding the details: goal, status, structure, findings, next steps. This file is navigation only.

When asked to "create a new project", or when a new analysis starts with no other instruction:

1. **Name** the folder `YYYY-MM-DD-short-slug` under `./projects/`, with today's date and a kebab-case slug that says what it is.
2. **Write a `CLAUDE.md`** in it whose first line is `# <Title>`. The title is what the `/` picker and the typeahead show.
3. **Add subfolders** only as needed, such as `data/`, `scripts/`, `notes/`.
4. **Register it** by adding one line to the list below, newest first.

### Active Projects

- **[Pricing Page Redesign](./projects/2026-03-02-pricing-page-redesign/CLAUDE.md)** - New pricing page with three tiers and an annual toggle.
- **[API Latency Investigation](./projects/2026-02-16-api-latency-investigation/CLAUDE.md)** - Why p95 latency on the search API doubled after the February deploy.
- **[Quarterly Planning Deck](./projects/2026-01-12-quarterly-planning-deck/CLAUDE.md)** - Q2 planning deck for the leadership review.

## Journal

Dated folders under `./journal/` for things that don't need a full project: meeting notes, captures, quick lookups. Same naming, same `CLAUDE.md` with a `# <Title>` first line.

## Archives

Finished projects move to `./projects/archives/`. The workspace plugins skip any folder named `archives`.
