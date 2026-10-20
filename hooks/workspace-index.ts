import type { EngineInterface } from 'claude-code'

// Index of a Claude workspace: one entry per folder in each collection (by
// default `projects/` and `journal/`), read from that folder's CLAUDE.md, plus
// the slash command stub for it when one exists. Reads only.
//
// Configured by environment variables, read again on every rebuild. Kept as an
// identical copy in workspace-finder and workspace-typeahead so each plugin
// stands alone.

export interface Collection {
  // Namespace of its stubs and mentions: `/p:01-slug`, `@p:slug`
  prefix: string
  // As configured, for messages
  folder: string
  // Absolute
  dir: string
  // The finder's slash command for it, such as `proj`
  command: string
}

export interface Config {
  workspace: string
  collections: Collection[]
  exclude: string[]
  stubs: boolean
  rank: boolean
  commandsDir: string
  // Settings that didn't parse, shown by the debug commands
  problems: string[]
}

export interface Entry {
  kind: string
  name: string
  slug: string
  date: string
  title: string
  path: string
  stub?: string
  head: string
  body: string
}

export interface Hit {
  entry: Entry
  score: number
  // Some keyword matched only in the CLAUDE.md body, which the / picker can't see
  inBody: boolean
}

export const DEFAULT_COLLECTIONS = 'p:projects:proj,j:journal:jrnl'

const STALE_MS = 60_000

// Date endings dropped from titles, since the date is shown apart
const DATE_TAILS = [
  /^(.*\S)\s*\([A-Z][a-z]{2} \d{1,2}, \d{4}\)$/,
  /^(.*\S)\s*\([A-Z][a-z]{2} \d{4}\)$/,
  /^(.*\S)\s*\(\d{4}-\d{2}-\d{2}\)$/,
  /^(.*\S)\s*- [A-Z][a-z]{2} \d{4}$/,
  /^(.*\S)\s*- \d{4}-\d{2}-\d{2}( to \d{4}-\d{2}-\d{2})?$/,
]

let config: Config | undefined
let entries: Entry[] = []
let missing: string[] = []
let builtAt = 0
let building: Promise<void> | undefined

export function allEntries(): readonly Entry[] {
  return entries
}

export function getConfig(): Config | undefined {
  return config
}

function isOff(value: string | undefined): boolean {
  return /^(0|false|no|off)$/i.test(value?.trim() ?? '')
}

export function parseCollections(
  spec: string,
  resolve: (folder: string) => string,
  problems: string[],
): Collection[] {
  const collections: Collection[] = []
  for (const part of spec.split(',').map(s => s.trim()).filter(Boolean)) {
    const [prefix = '', folder = '', named] = part.split(':').map(s => s.trim())
    const command = named || folder.split('/').filter(Boolean).pop() || ''
    if (!/^[a-z0-9_-]+$/i.test(prefix) || !folder) {
      problems.push(`collection "${part}" is not prefix:folder[:command]`)
      continue
    }
    if (!/^[a-z0-9_-]{1,64}$/i.test(command)) {
      problems.push(`collection "${part}" has a command name that isn't letters, digits, _ or -`)
      continue
    }
    if (collections.some(c => c.prefix === prefix)) {
      problems.push(`collection prefix "${prefix}" is used twice`)
      continue
    }
    collections.push({ prefix, folder, dir: resolve(folder), command })
  }
  return collections
}

async function readConfig($: EngineInterface): Promise<Config> {
  const home = (await $.env.get('HOME')) ?? ''
  const expand = (p: string) => p.replace(/^~(?=$|\/)/, home).replace(/\/+$/, '')
  const problems: string[] = []

  const workspace = expand((await $.env.get('CLAUDE_WORKSPACE_DIR'))?.trim() || '~/workspace')
  const configDir = expand((await $.env.get('CLAUDE_CONFIG_DIR'))?.trim() || '~/.claude')
  const commandsDir = expand((await $.env.get('CLAUDE_WORKSPACE_COMMANDS_DIR'))?.trim() || `${configDir}/commands`)
  const spec = (await $.env.get('CLAUDE_WORKSPACE_COLLECTIONS'))?.trim() || DEFAULT_COLLECTIONS
  const exclude = ((await $.env.get('CLAUDE_WORKSPACE_EXCLUDE')) ?? 'archives')
    .split(',').map(s => s.trim()).filter(Boolean)

  const resolve = (folder: string) => /^[~/]/.test(folder) ? expand(folder) : `${workspace}/${folder}`
  return {
    workspace,
    collections: parseCollections(spec, resolve, problems),
    exclude,
    stubs: !isOff(await $.env.get('CLAUDE_WORKSPACE_STUBS')),
    rank: !isOff(await $.env.get('CLAUDE_WORKSPACE_STUBS_RANK')),
    commandsDir,
    problems,
  }
}

export function cleanTitle(raw: string): string {
  let title = raw
  for (const tail of DATE_TAILS) title = title.match(tail)?.[1] ?? title
  return title.match(/^\d{4}-\d{2}-\d{2}\s*-?\s*(.+)$/)?.[1] ?? title
}

async function build($: EngineInterface): Promise<void> {
  const next = await readConfig($)
  const found: Entry[] = []
  const absent: string[] = []

  for (const c of next.collections) {
    // Stubs are named `<slug>.md`, or `<rank>-<slug>.md` when ranked
    const stubs = new Map<string, string>()
    try {
      for (const file of await $.fs.list(`${next.commandsDir}/${c.prefix}`)) {
        if (!file.name.endsWith('.md')) continue
        const base = file.name.slice(0, -3)
        const command = `/${c.prefix}:${base}`
        const unranked = base.match(/^\d+-(.+)$/)?.[1]
        if (unranked && !stubs.has(unranked)) stubs.set(unranked, command)
        stubs.set(base, command)
      }
    } catch {}

    let dirs
    try {
      dirs = (await $.fs.list(c.dir))
        .filter(d => (d.kind === 'dir' || d.isLink) && !d.name.startsWith('.') && !next.exclude.includes(d.name))
    } catch {
      absent.push(c.dir)
      continue
    }

    await Promise.all(dirs.map(async d => {
      const path = `${c.dir}/${d.name}/CLAUDE.md`
      let body: string
      try { body = await $.fs.read(path) } catch { return }
      const [, date = '', slug = d.name] = d.name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/) ?? []
      const title = cleanTitle(body.match(/^# (.+)$/m)?.[1]?.trim() ?? slug)
      found.push({
        kind: c.prefix, name: d.name, slug, date, title, path,
        stub: stubs.get(slug),
        head: `${slug} ${title}`.toLowerCase(),
        body: body.toLowerCase(),
      })
    }))
  }

  // Newest first, undated folders last
  found.sort((a, b) => b.date.localeCompare(a.date) || b.name.localeCompare(a.name))
  config = next
  entries = found
  missing = absent
  builtAt = Date.now()
}

export function refresh($: EngineInterface, force = false): Promise<void> {
  if (!force && Date.now() - builtAt < STALE_MS) return Promise.resolve()
  building ??= build($).finally(() => { building = undefined })
  return building
}

export function search(query: string, kind?: string, list: readonly Entry[] = entries): Hit[] {
  // Each keyword matches at the start of a word, so `rsi` skips "versions"
  const terms = query.toLowerCase().split(/[\s\-+]+/).filter(Boolean)
    .map(t => new RegExp(`(?:^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  if (terms.length === 0) return []
  const scored: Hit[] = []
  for (const entry of list) {
    if (kind && entry.kind !== kind) continue
    let score = 0
    let inBody = false
    for (const term of terms) {
      if (term.test(entry.head)) score += 10
      else if (term.test(entry.body)) { score += 1; inBody = true }
      else { score = -1; break }
    }
    if (score > 0) scored.push({ entry, score, inBody })
  }
  // Stable sort, so equal scores stay newest first
  return scored.sort((a, b) => b.score - a.score)
}

export function label(entry: Entry): string {
  return `${entry.date} ${entry.title}`.trim().slice(0, 80)
}

// The lines both debug commands lead with
export function describe(): string[] {
  if (!config) return ['index: not built yet']
  const counts = config.collections
    .map(c => `${entries.filter(x => x.kind === c.prefix).length} in ${c.folder}`)
  return [
    `workspace: ${config.workspace}`,
    `collections: ${config.collections.map(c => `${c.prefix}:${c.folder}`).join(', ') || 'none'}`,
    `index: ${counts.join(', ') || 'empty'}, ${entries.filter(x => !x.stub).length} without a stub`,
    `stubs: ${config.stubs ? `on, ${config.rank ? 'ranked' : 'unranked'}, in ${config.commandsDir}` : 'off'}`,
    ...missing.map(dir => `missing: ${dir}`),
    ...config.problems.map(p => `problem: ${p}`),
  ]
}
