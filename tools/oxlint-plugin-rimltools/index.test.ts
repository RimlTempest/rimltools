import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

// 規約（.agents/skills/rimltools-typescript）を機械的に落とす規則が、落とすべきものを
// 落とし、許すべきものを許すこと。oxlint の RuleTester は Node 専用なので、実際の
// oxlint CLI にこの plugin（index.ts）を読ませて確かめる（本番と同じ読み込み経路）。

const pluginPath = new URL('./index.ts', import.meta.url).pathname
let dir = ''

const config = (rules: Record<string, string>) =>
  JSON.stringify({ jsPlugins: [pluginPath], plugins: [], categories: {}, rules })

const ALL_RULES = {
  'rimltools/no-class': 'error',
  'rimltools/no-type-assertion': 'error',
  'rimltools/no-enum': 'error',
  'rimltools/no-throw-in-domain': 'error',
}

type Diagnostic = { code: string }

const isDiagnostics = (value: unknown): value is { diagnostics: Diagnostic[] } =>
  typeof value === 'object'
  && value !== null
  && 'diagnostics' in value
  && Array.isArray(value.diagnostics)

/** ソースを lint して、報告された規則名（`rimltools(no-class)` の括弧の中）を返す */
const lint = async (source: string): Promise<string[]> => {
  const file = join(dir, 'probe.ts')
  await writeFile(file, source)
  const out = await $`bunx oxlint -c ${join(dir, 'oxlintrc.json')} --format json ${file}`
    .nothrow()
    .quiet()
    .text()
  const parsed: unknown = JSON.parse(out)
  if (!isDiagnostics(parsed)) return []
  // oxlint 既定の規則（未使用の宣言など）は数えない
  return parsed.diagnostics
    .flatMap((d) => /^rimltools\((.*)\)$/.exec(d.code)?.slice(1, 2) ?? [])
    .toSorted()
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oxlint-plugin-'))
  await writeFile(join(dir, 'oxlintrc.json'), config(ALL_RULES))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('rimltools oxlint plugin', () => {
  test.each([
    ['class A {}', ['no-class']],
    ['export const B = class {}', ['no-class']],
    ['export abstract class C {}', ['no-class']],
    ['export const s = 1 as unknown', ['no-type-assertion']],
    ['export const t = <string>(1 as unknown)', ['no-type-assertion', 'no-type-assertion']],
    ['declare const v: string | undefined; v!.length', ['no-type-assertion']],
    ['enum Kind { A }', ['no-enum']],
    ['export const f = () => { throw new Error("x") }', ['no-throw-in-domain']],
  ])('reports %p', async (source, expected) => {
    expect(await lint(source)).toEqual(expected)
  })

  test.each([
    'export const make = () => ({ run: () => 1 })',
    'export const xs = [1, 2] as const',
    "export const Kind = { A: 'a' } as const",
    'export const f = () => ({ ok: false, error: "x" })',
  ])('allows %p', async (source) => {
    expect(await lint(source)).toEqual([])
  })
})
