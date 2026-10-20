import type { EngineInterface, PromptAutocompleteSuggestion, Register } from 'claude-code'

import { describe, label, refresh, search } from './workspace-index.ts'
import type { Hit } from './workspace-index.ts'
import { describeStubs, syncStubs } from './workspace-stubs.ts'

// Resolves a word to a workspace entry's CLAUDE.md, as typeahead rows.
//
// - A word like `/pricing` or `/pricing-api` (terms joined with `-`) adds rows
//   below the built-in ones, wherever the word sits in the prompt.
// - At the start of the prompt a row writes the entry's stub command, such as
//   `/p:03-pricing-page`. An entry with a stub is only added there when it
//   matches in its CLAUDE.md body, since the built-in picker already matches
//   stub names and titles.
// - Mid-sentence, where the built-in picker shows nothing and a command won't
//   run, a row writes an `@` mention of the entry's CLAUDE.md so its notes go
//   along with the prompt. So does any entry with no stub.
// - At session start the stubs are written (see workspace-stubs.ts).
// - /typeahead-debug: settings, what the index holds and which words the hook saw.

const DEFAULT_ROWS = 6
const TRIGGER = /^\/(.{2,})$/

let maxRows = DEFAULT_ROWS
let seen: string[] = []

async function readSettings($: EngineInterface): Promise<void> {
  const rows = Number((await $.env.get('CLAUDE_WORKSPACE_TYPEAHEAD_ROWS'))?.trim())
  maxRows = Number.isInteger(rows) && rows > 0 ? rows : DEFAULT_ROWS
}

// At the start of the prompt an entry's stub runs as a command. Elsewhere, or
// with no stub, the row is an `@` mention of its CLAUDE.md.
export function toRows(
  hits: readonly Hit[],
  isFirst: boolean,
  max: number,
): PromptAutocompleteSuggestion[] {
  return hits
    .filter(h => !(isFirst && h.entry.stub && !h.inBody))
    .slice(0, max)
    .map(({ entry: x, inBody }) => {
      const asCommand = isFirst && x.stub
      const text = asCommand ? x.stub! : `@${x.path}`
      return {
        text,
        label: asCommand ? text : `@${x.kind}:${x.slug}`,
        description: inBody ? `${label(x)} - in notes` : label(x),
      }
    })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'typeahead-debug',
      description: 'workspace-typeahead: settings, index size and the words the typeahead saw',
    })
    await readSettings($)
    void refresh($, true)
    return next(e)
  })

  // Write the stubs, then ask Claude Code to rescan commands so they work now
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const report = await syncStubs($)
    return report.written + report.removed > 0 ? { ...result, reloadSkills: true } : result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'typeahead-debug' }, async $ => {
    await readSettings($)
    await refresh($, true)
    return {
      text: [
        ...describe(),
        ...describeStubs(),
        `rows: up to ${maxRows}`,
        `words seen (newest last): ${seen.length ? seen.join('  ') : 'none'}`,
      ].join('\n'),
    }
  })

  on('prompt.autocomplete', async ($, e, next) => {
    seen = [...seen, JSON.stringify(e.token)].slice(-15)
    const own = await next(e)
    const [, query] = e.token.match(TRIGGER) ?? []
    if (!query) return own

    void refresh($)
    const isFirst = e.text.slice(0, e.start).trim() === ''
    const rows = toRows(search(query), isFirst, maxRows)
    return { suggestions: [...own.suggestions, ...rows] }
  })
}
