# Claude Workspace Typeahead

**Pull any project's notes into any prompt, from anywhere in the sentence.**

You keep a folder of projects and notes, each with a `CLAUDE.md` holding the goal, the status, and what you found. That's the context Claude needs, but getting it into a prompt means remembering a folder name and typing a path. This [Claude Code](https://claude.com/claude-code) plugin turns it into a typeahead: type `;pricing` in the middle of a sentence, pick the row, and the project's `CLAUDE.md` rides along with your prompt as an `@` mention.

```
> compare the plan in ;pric█
  @p:pricing-page-redesign       2026-03-02 Pricing Page Redesign
  @j:team-offsite-notes          2026-02-20 Team Offsite Notes - in notes
  @p:quarterly-planning-deck     2026-01-12 Quarterly Planning Deck - in notes
```

```
> compare the plan in @/Users/you/workspace/projects/2026-03-02-pricing-page-redesign/CLAUDE.md with what we decided at the offsite
```

## Why you'd want it

- **Context without the path.** Mention a project by any word in its title or notes. No folder names, no dates, no `cd`.
- **Works mid-sentence.** Claude Code's own `/` picker only works at the start of the prompt. This one works wherever your cursor is, even after a `/goal` or another command.
- **Finds what's only in the notes.** Matches the whole `CLAUDE.md`, not just the title, and marks those rows "- in notes". Remember a detail, not a name.
- **Several keywords at once.** Join them with `-`: `;latency-embeddings` finds the entry that has both.
- **One slash command per entry, for free.** At session start it writes `/p:01-pricing-page-redesign` style commands, newest first, so the built-in `/` menu lists your whole workspace by date and title.
- **Nothing to maintain.** The index is the folder listing. New project? It's in the typeahead within a minute and in the `/` menu at the next session.

## Use cases

- **Cross-project questions.** "Does the fix in ;latency change anything in ;pricing?" pulls in both notes files.
- **Picking up where you left off.** Start a prompt with `;planning` and Enter runs that project's stub command, which tells Claude to read its notes.
- **Meeting follow-ups.** "Draft the follow-up email from ;vendor-call" grabs the journal entry you wrote during the call.
- **Long-running goals.** `/goal ship the redesign described in ;pricing` gives the goal the full project context.
- **Status reports.** "Summarize this week across ;latency ;pricing ;onboarding" gets three files' worth of status in one prompt.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install workspace-typeahead --marketplace metaskills/claude-workspace-typeahead-mod
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). From a shell, the same thing:

```bash
claude plugin install workspace-typeahead --marketplace metaskills/claude-workspace-typeahead-mod
```

In the desktop app, where `/plugin` doesn't run: click + next to the prompt box, then Plugins, Add marketplace with `metaskills/claude-workspace-typeahead-mod`, then Add plugin.

Then tell it where your workspace is (next section) and start a new session.

## Your workspace

A Claude workspace is a folder of collections, and a collection is a folder of entries. Each entry is a folder with a `CLAUDE.md` whose first `# ` line is its title. By default the plugin reads `~/workspace` with two collections:

```
~/workspace/
├── CLAUDE.md                                  # optional: how you run the workspace
├── projects/
│   ├── 2026-03-02-pricing-page-redesign/
│   │   └── CLAUDE.md                          # "# Pricing Page Redesign - Mar 2026"
│   ├── 2026-02-16-api-latency-investigation/
│   │   └── CLAUDE.md
│   └── archives/                              # skipped
└── journal/
    └── 2026-03-04-vendor-call-search-provider/
        └── CLAUDE.md
```

- **Folder names** are `YYYY-MM-DD-short-slug`. The date sorts entries newest first and the slug is what the rows show. Undated folders work too and sort last.
- **Titles** come from the first `# ` heading. A date at the end, like "- Mar 2026" or "(Jan 2026)", is dropped since the date is shown on its own.
- **Folders** named `archives` or starting with `.` are skipped.

Don't have a workspace yet? Copy [`example-workspace/`](./example-workspace/) to `~/workspace`. Its `CLAUDE.md` tells Claude how to create and register new projects, so "create a new project for the Q3 launch" does the right thing from then on.

## How it works

Type `/` or `;` followed by at least two characters. The plugin's rows show up below the built-in ones, up to 6, title matches first and then newest first.

| Where the word is | What the row writes | Which entries |
| :- | :- | :- |
| Start of the prompt, `;word` | The entry's stub command, such as `/p:01-pricing-page-redesign` | Every match |
| Start of the prompt, `/word` | The stub command | Only notes matches and entries with no stub, since the built-in picker already shows the rest |
| Anywhere else | `@/path/to/entry/CLAUDE.md`, labeled like `@p:pricing-page-redesign` | Every match |

Each keyword has to match the start of a word, so `rsi` finds "RSI Reset" but not "versions". A row only replaces the one word at the cursor, which is why several keywords are joined with `-` instead of spaces.

### The stub commands

At session start the plugin writes one command per entry into `~/.claude/commands/<prefix>/`:

```markdown
---
description: "2026-03-02 Pricing Page Redesign"
---

Read /Users/you/workspace/projects/2026-03-02-pricing-page-redesign/CLAUDE.md
```

Then it asks Claude Code to rescan commands, so they work in that same session. The two-digit rank keeps the `/` menu newest first. Without it the menu is alphabetical, and Claude Code's picker won't match across the `01-`, so `/p:pricing` finds nothing. Type `/pricing` (no namespace) or use `;pricing` instead, or turn ranking off.

The plugin only writes to a stub folder it created, marked by a `.workspace-stubs` file, or one that doesn't exist yet. If you already have your own `~/.claude/commands/p/`, it's left alone and `/typeahead-debug` says so. Stale stubs are deleted when their entry is renamed, archived or removed.

## Configuration

Everything is set with environment variables. Put them in the `env` block of `~/.claude/settings.json` so every session gets them:

```json
{
  "env": {
    "CLAUDE_WORKSPACE_DIR": "~/Documents/claude",
    "CLAUDE_WORKSPACE_COLLECTIONS": "p:projects:proj,j:journal:jrnl,m:meetings"
  }
}
```

| Variable | Default | What it does |
| :- | :- | :- |
| `CLAUDE_WORKSPACE_DIR` | `~/workspace` | The workspace root |
| `CLAUDE_WORKSPACE_COLLECTIONS` | `p:projects:proj,j:journal:jrnl` | Comma-separated `prefix:folder[:command]`. The prefix names the stubs (`/p:...`) and mentions (`@p:...`). The folder is relative to the workspace or absolute. The command is used by the [finder plugin](https://github.com/metaskills/claude-workspace-finder-mod) |
| `CLAUDE_WORKSPACE_EXCLUDE` | `archives` | Comma-separated folder names to skip |
| `CLAUDE_WORKSPACE_STUBS` | `true` | Set `false` to stop writing stub commands. Rows then write `@` mentions everywhere, or use stubs you generate yourself if they are named `<slug>.md` or `<rank>-<slug>.md` |
| `CLAUDE_WORKSPACE_STUBS_RANK` | `true` | Set `false` for plain `/p:pricing-page-redesign` names, sorted alphabetically |
| `CLAUDE_WORKSPACE_COMMANDS_DIR` | `$CLAUDE_CONFIG_DIR/commands`, else `~/.claude/commands` | Where stub folders go |
| `CLAUDE_WORKSPACE_TYPEAHEAD_TRIGGERS` | `/;` | The characters that start a search |
| `CLAUDE_WORKSPACE_TYPEAHEAD_ROWS` | `6` | Most rows added per keystroke |

The index re-reads these on every rebuild (at most once a minute while you type). The stubs are written at session start. Changing a variable in `settings.json` takes effect in the next session.

## Try it without installing

```bash
git clone https://github.com/metaskills/claude-workspace-typeahead-mod.git
cd claude-workspace-typeahead-mod
CLAUDE_WORKSPACE_DIR="$PWD/example-workspace" CLAUDE_WORKSPACE_STUBS=false claude --plugin-dir .
```

Then type `what did we find in ;laten` and pick the row.

## Troubleshooting

Run `/typeahead-debug`. It shows the workspace it read, the collections, how many entries each has, how many have no stub, whether the stub folder was skipped, any settings it couldn't parse, and the last 15 words the typeahead saw.

- **No rows at all:** check `workspace:` and any `missing:` line in `/typeahead-debug`. A collection folder that doesn't exist is reported there.
- **Rows but no `/p:` commands:** look for `stubs skipped, not made by this plugin`. Move your own commands out of that folder, or set `CLAUDE_WORKSPACE_STUBS=false`.
- **Turn it off for a session:** start Claude Code with `--safe-mode`.

## Works well with

[**Claude Workspace Finder**](https://github.com/metaskills/claude-workspace-finder-mod) adds `/proj <keywords>` and `/jrnl <keywords>`: search with spaces between keywords, pick from a list, and open the entry. Both plugins read the same settings and write the same stubs, so install either or both.

## Development

The hooks module is TypeScript, loaded by Claude Code with no build step.

- `hooks/register.ts` - the typeahead hook and `/typeahead-debug`
- `hooks/workspace-index.ts` - reads the settings and indexes the workspace
- `hooks/workspace-stubs.ts` - writes the stub commands
- `tests/` - run with `claude plugin test .`

`claude plugin validate .` checks the manifest and the module. `workspace-index.ts`, `workspace-stubs.ts` and `tests/memory-fs.ts` are identical copies in the finder plugin, so each plugin stands alone. Change them in both.

## License

[MIT](./LICENSE)
