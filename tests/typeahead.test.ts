import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { toRows } from '../hooks/register.ts'
import { cleanTitle, parseCollections, search } from '../hooks/workspace-index.ts'
import type { Entry } from '../hooks/workspace-index.ts'
import { CMDS, FILES, WS, memoryFs, stubsIn, typed } from './memory-fs.ts'

function engine(on: On): void {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
}

function entry(kind: string, slug: string, title: string, body: string, stub?: string): Entry {
  return {
    kind, name: `2026-01-01-${slug}`, slug, date: '2026-01-01', title,
    path: `${WS}/x/${slug}/CLAUDE.md`, stub,
    head: `${slug} ${title}`.toLowerCase(), body: body.toLowerCase(),
  }
}

test('session start writes ranked stubs, newest first, skipping archives', async ($, on) => {
  const fs = memoryFs(on)
  engine(on)

  const first = await $.classic.SessionStart({ source: 'startup' })
  expect(first.reloadSkills).toBe(true)
  expect(stubsIn(fs, 'p')).toEqual([
    '.workspace-stubs',
    '01-pricing-page-redesign.md',
    '02-api-latency-investigation.md',
    '03-quarterly-planning-deck.md',
  ])
  expect(stubsIn(fs, 'j')).toEqual([
    '.workspace-stubs',
    '01-vendor-call-search-provider.md',
    '02-team-offsite-notes.md',
  ])
  expect(fs.get(`${CMDS}/p/03-quarterly-planning-deck.md`)).toBe(
    `---\ndescription: "2026-01-12 Quarterly Planning Deck"\n---\n\nRead ${WS}/projects/2026-01-12-quarterly-planning-deck/CLAUDE.md\n`,
  )

  // Nothing changed, so nothing is written and no rescan is asked for
  const again = await $.classic.SessionStart({ source: 'startup' })
  expect(again.reloadSkills).toBeUndefined()
})

test('a new entry renumbers the stubs and old names are removed', async ($, on) => {
  const fs = memoryFs(on)
  engine(on)
  await $.classic.SessionStart({ source: 'startup' })

  fs.set(`${WS}/projects/2026-03-10-onboarding-emails/CLAUDE.md`, '# Onboarding Emails\n')
  fs.delete(`${WS}/projects/2026-01-12-quarterly-planning-deck/CLAUDE.md`)
  await $.classic.SessionStart({ source: 'startup' })
  expect(stubsIn(fs, 'p')).toEqual([
    '.workspace-stubs',
    '01-onboarding-emails.md',
    '02-pricing-page-redesign.md',
    '03-api-latency-investigation.md',
  ])
})

test('a commands folder this plugin did not make is left alone', async ($, on) => {
  const fs = memoryFs(on, { ...FILES, [`${CMDS}/p/handmade.md`]: 'mine' })
  engine(on)
  await $.classic.SessionStart({ source: 'startup' })
  expect(stubsIn(fs, 'p')).toEqual(['handmade.md'])
  expect(stubsIn(fs, 'j')).toContain('01-vendor-call-search-provider.md')
})

test('settings come from environment variables', async ($, on) => {
  const fs = memoryFs(on, FILES, {
    CLAUDE_WORKSPACE_STUBS_RANK: 'false',
    CLAUDE_WORKSPACE_COLLECTIONS: 'n:journal',
    CLAUDE_WORKSPACE_COMMANDS_DIR: '~/cmds',
  })
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'startup' })
  expect([...fs.keys()].filter(p => p.startsWith('/home/me/cmds/')).sort()).toEqual([
    '/home/me/cmds/n/.workspace-stubs',
    '/home/me/cmds/n/team-offsite-notes.md',
    '/home/me/cmds/n/vendor-call-search-provider.md',
  ])

  const { text } = await $.command.run(typed('typeahead-debug'))
  expect(text).toContain('collections: n:journal')
  expect(text).toContain('index: 2 in journal, 0 without a stub')
  expect(text).toContain('stubs: on, unranked, in /home/me/cmds')
})

test('CLAUDE_WORKSPACE_STUBS=false writes nothing', async ($, on) => {
  const fs = memoryFs(on, FILES, { CLAUDE_WORKSPACE_STUBS: 'false' })
  engine(on)
  const result = await $.classic.SessionStart({ source: 'startup' })
  expect(result.reloadSkills).toBeUndefined()
  expect([...fs.keys()].some(p => p.startsWith(CMDS))).toBe(false)
})

test('rows write the stub at the start of the prompt and an @ mention elsewhere', () => {
  const list = [
    entry('p', 'pricing-page', 'Pricing Page', 'tiers', '/p:01-pricing-page'),
    entry('j', 'offsite', 'Team Offsite', 'pricing is the priority'),
  ]
  const hits = search('pricing', undefined, list)

  expect(toRows(hits, true, ';', 6).map(r => r.text)).toEqual([
    '/p:01-pricing-page',
    `@${WS}/x/offsite/CLAUDE.md`,
  ])
  // Under `/` the built-in picker already lists stubbed title matches
  expect(toRows(hits, true, '/', 6).map(r => r.label)).toEqual(['@j:offsite'])
  const mid = toRows(hits, false, '/', 6)
  expect(mid.map(r => r.label)).toEqual(['@p:pricing-page', '@j:offsite'])
  expect(mid[1]?.description).toBe('2026-01-01 Team Offsite - in notes')
  expect(toRows(hits, false, '/', 1)).toHaveLength(1)
})

test('search matches the start of words, every keyword, titles first', () => {
  const list = [
    entry('p', 'notes', 'Notes', 'versions of the deck'),
    entry('p', 'rsi-reset', 'RSI Reset', 'simpler process'),
    entry('p', 'eval', 'Eval Agents', 'how rsi judges work'),
  ]
  expect(search('rsi', undefined, list).map(h => h.entry.slug)).toEqual(['rsi-reset', 'eval'])
  expect(search('rsi-judges', undefined, list).map(h => h.entry.slug)).toEqual(['eval'])
  expect(search('rsi', 'j', list)).toEqual([])
})

test('titles drop date endings and leading dates', () => {
  expect(cleanTitle('Pricing Page - Mar 2026')).toBe('Pricing Page')
  expect(cleanTitle('Planning Deck (Jan 2026)')).toBe('Planning Deck')
  expect(cleanTitle('Town Hall (Aug 12, 2026)')).toBe('Town Hall')
  expect(cleanTitle('2026-02-20 Team Offsite')).toBe('Team Offsite')
  expect(cleanTitle('Trends (Apr 2026, refreshed Jul 2026)')).toBe('Trends (Apr 2026, refreshed Jul 2026)')
})

test('collections parse prefix:folder[:command] and report bad entries', () => {
  const problems: string[] = []
  const resolve = (f: string) => f.startsWith('/') ? f : `${WS}/${f}`
  const list = parseCollections('p:projects:proj, n:/abs/notes, bad, p:again, x:y:no spaces', resolve, problems)
  expect(list).toEqual([
    { prefix: 'p', folder: 'projects', dir: `${WS}/projects`, command: 'proj' },
    { prefix: 'n', folder: '/abs/notes', dir: '/abs/notes', command: 'notes' },
  ])
  expect(problems).toHaveLength(3)
})
