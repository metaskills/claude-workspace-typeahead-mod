import type { CommandRunInput, FsEntry, On } from 'claude-code'
import { mock } from 'claude-code/testing'

// A workspace in memory: answers `$.fs` and the `rm` the stub sync runs, and
// sets the environment the plugin reads. Shared by both plugins' tests.

export const WS = '/home/me/workspace'
export const CMDS = '/home/me/.claude/commands'

export const FILES: Record<string, string> = {
  [`${WS}/projects/2026-03-02-pricing-page-redesign/CLAUDE.md`]:
    '# Pricing Page Redesign - Mar 2026\n\nThree tiers and an annual toggle.\n',
  [`${WS}/projects/2026-02-16-api-latency-investigation/CLAUDE.md`]:
    '# API Latency Investigation - Feb 2026\n\nThe ranking step calls the embeddings service once per result.\n',
  [`${WS}/projects/2026-01-12-quarterly-planning-deck/CLAUDE.md`]:
    '# Quarterly Planning Deck (Jan 2026)\n\nThe Q2 deck, tied to the pricing work.\n',
  [`${WS}/projects/archives/2025-11-01-old-thing/CLAUDE.md`]: '# Old Thing\n',
  [`${WS}/journal/2026-03-04-vendor-call-search-provider/CLAUDE.md`]:
    '# Vendor Call - Search Provider Renewal\n\nTheir vector tier could replace embeddings.\n',
  [`${WS}/journal/2026-02-20-team-offsite-notes/CLAUDE.md`]:
    '# 2026-02-20 Team Offsite Notes\n\nPricing is the top design priority.\n',
}

export function memoryFs(
  on: On,
  files: Record<string, string> = FILES,
  env: Record<string, string> = {},
): Map<string, string> {
  const fs = new Map(Object.entries(files))
  mock.env(on, { HOME: '/home/me', ...env })

  on('fs.read', (_, e) => {
    const text = fs.get(e.path)
    return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }
  })
  on('fs.write', (_, e) => {
    fs.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', (_, e) => {
    const kinds = new Map<string, FsEntry['kind']>()
    for (const path of fs.keys()) {
      if (!path.startsWith(`${e.path}/`)) continue
      const [name = '', ...rest] = path.slice(e.path.length + 1).split('/')
      kinds.set(name, rest.length > 0 ? 'dir' : 'file')
    }
    if (kinds.size === 0) return { deny: `ENOENT ${e.path}` }
    return {
      value: [...kinds].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })),
    }
  })
  on('process.run', (_, e) => {
    if (e.argv[0] === 'rm') for (const path of e.argv.slice(3)) fs.delete(path)
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return fs
}

export function stubsIn(fs: Map<string, string>, prefix: string): string[] {
  return [...fs.keys()]
    .filter(p => p.startsWith(`${CMDS}/${prefix}/`))
    .map(p => p.slice(CMDS.length + prefix.length + 2))
    .sort()
}

// A slash command as the person types it at the terminal
export function typed(command: string, args = ''): CommandRunInput {
  return { command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }
}
