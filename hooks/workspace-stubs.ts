import type { EngineInterface, FsEntry } from 'claude-code'

import { allEntries, getConfig, refresh } from './workspace-index.ts'

// One slash command per workspace entry, such as `/p:01-pricing-page`, whose
// prompt is `Read <entry>/CLAUDE.md`. Claude Code's own `/` picker then lists
// every entry with its date and title.
//
// Written at session start into `<commands dir>/<prefix>/`, newest first with a
// two-digit rank when ranking is on. Only a folder that doesn't exist yet, or
// one this code made (it holds MARKER), is ever written, so commands written by
// hand are never touched. Files are only rewritten when they change, so two
// plugins syncing the same folder at once write the same bytes.
//
// Kept as an identical copy in workspace-finder and workspace-typeahead so each
// plugin stands alone.

export interface StubReport {
  written: number
  removed: number
  // Folders left alone because something else owns them
  skipped: string[]
  error?: string
}

const MARKER = '.workspace-stubs'
const MARKER_TEXT = 'Written by the workspace-finder and workspace-typeahead Claude Code plugins.\nEvery .md file here is regenerated at session start. Delete this folder to start over.\n'

let last: StubReport | undefined

export function lastStubReport(): StubReport | undefined {
  return last
}

function stubText(date: string, title: string, path: string): string {
  const description = JSON.stringify(`${date} ${title}`.trim())
  return `---\ndescription: ${description}\n---\n\nRead ${path}\n`
}

async function sync($: EngineInterface): Promise<StubReport> {
  await refresh($, true)
  const config = getConfig()
  const report: StubReport = { written: 0, removed: 0, skipped: [] }
  if (!config?.stubs) return report

  for (const c of config.collections) {
    const out = `${config.commandsDir}/${c.prefix}`
    let existing: FsEntry[] = []
    try { existing = await $.fs.list(out) } catch {}
    if (existing.length > 0 && !existing.some(f => f.name === MARKER)) {
      report.skipped.push(out)
      continue
    }
    if (existing.length === 0) await $.fs.write(`${out}/${MARKER}`, MARKER_TEXT)

    const want = new Map<string, string>()
    allEntries().filter(x => x.kind === c.prefix).forEach((x, i) => {
      const name = config.rank ? `${String(i + 1).padStart(2, '0')}-${x.slug}` : x.slug
      want.set(`${name}.md`, stubText(x.date, x.title, x.path))
    })

    const have = new Set(existing.map(f => f.name))
    for (const [name, text] of want) {
      const path = `${out}/${name}`
      let current: string | undefined
      if (have.has(name)) try { current = await $.fs.read(path) } catch {}
      if (current === text) continue
      await $.fs.write(path, text)
      report.written++
    }

    const stale = existing
      .filter(f => f.name.endsWith('.md') && !want.has(f.name))
      .map(f => `${out}/${f.name}`)
    if (stale.length > 0) {
      await $.process.run(['rm', '-f', '--', ...stale])
      report.removed += stale.length
    }
  }

  // The index picks up the stub names it just wrote
  await refresh($, true)
  return report
}

export async function syncStubs($: EngineInterface): Promise<StubReport> {
  last = await sync($).catch(err => ({
    written: 0, removed: 0, skipped: [],
    error: err instanceof Error ? err.message : String(err),
  }))
  return last
}

export function describeStubs(): string[] {
  if (!last) return ['last stub sync: not run this session']
  return [
    `last stub sync: ${last.written} written, ${last.removed} removed${last.error ? `, failed: ${last.error}` : ''}`,
    ...last.skipped.map(dir => `stubs skipped, not made by this plugin: ${dir}`),
  ]
}
