import type { Tool } from '../lib/tools.ts'

/** これが変わると全ツールを出し直す（ci.yml の root フィルタと同じ考え方） */
const sharedRoots = new Set(['package.json', 'bun.lock', 'bunfig.toml', 'mise.toml', 'tools.json'])
const sharedDirs = ['packages/']

/** 配信物に影響しないファイル（ドキュメントや計画）はリリースの理由にしない */
const isDocs = (rel: string): boolean =>
  rel.endsWith('.md')
  || rel.startsWith('docs/')
  || rel.startsWith('plans/')
  || rel.startsWith('.claude/')
  || rel === 'scripts/lanes.tsv'

export const changedTools = (files: string[], tools: Tool[]): string[] => {
  const all = files.some((f) => sharedRoots.has(f) || sharedDirs.some((d) => f.startsWith(d)))
  if (all) return tools.map((t) => t.name)
  return tools
    .filter((tool) =>
      files.some((f) => f.startsWith(`${tool.path}/`) && !isDocs(f.slice(tool.path.length + 1))),
    )
    .map((t) => t.name)
}
