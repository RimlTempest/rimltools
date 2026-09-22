/**
 * Service Worker（TypeScript）を、ブラウザがそのまま読める 1 ファイルの JS にする。
 *
 *   bun scripts/build-sw.ts <entry.ts> <out.js>
 *
 * 各プロダクトの `services/web` の `bun run sw`（dev / build の前に自動で走る）が呼ぶ。
 * 出力（`public/sw.js`）は生成物なのでコミットしない（.gitignore）。
 *
 * SW は `register('/sw.js')` で classic script として登録するので、import / export の
 * 残らない IIFE にする。
 */

import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { Result } from './lib/tools.ts'

export type BuildSwArgs = { entry: string; out: string }

export const parseBuildSwArgs = (argv: readonly string[]): Result<BuildSwArgs, string> => {
  const [entry, out, ...rest] = argv
  if (entry === undefined || out === undefined || rest.length > 0) {
    return { ok: false, error: 'usage: bun scripts/build-sw.ts <entry.ts> <out.js>' }
  }
  if (!out.endsWith('.js')) return { ok: false, error: `output must be a .js file: ${out}` }
  return { ok: true, value: { entry, out } }
}

export const buildServiceWorker = async (args: BuildSwArgs): Promise<Result<void, string>> => {
  const result = await Bun.build({
    entrypoints: [args.entry],
    target: 'browser',
    format: 'iife',
    minify: true,
    sourcemap: 'none',
  })
  if (!result.success) {
    return { ok: false, error: result.logs.map((log) => log.message).join('\n') }
  }
  const [output] = result.outputs
  if (output === undefined) return { ok: false, error: 'no output was produced' }

  await mkdir(dirname(args.out), { recursive: true })
  await Bun.write(
    args.out,
    `// 生成物（scripts/build-sw.ts）。編集しない。元は ${args.entry}\n${await output.text()}`,
  )
  return { ok: true, value: undefined }
}

if (import.meta.main) {
  const parsed = parseBuildSwArgs(process.argv.slice(2))
  if (!parsed.ok) {
    console.error(parsed.error)
    process.exit(2)
  }
  const built = await buildServiceWorker(parsed.value)
  if (!built.ok) {
    console.error(built.error)
    process.exit(1)
  }
  console.log(`service worker: ${parsed.value.entry} → ${parsed.value.out}`)
}
