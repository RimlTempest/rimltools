/**
 * dist/ を作る: tools.json → index.html / 404.html、public/ をそのまま複製。
 *
 * 台帳の検証はリポジトリ共通の scripts/lib/tools.ts を使う（ビルド時だけの依存。
 * 実行時の Worker には何も同梱しない）。
 */

import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { loadTools } from '../../../scripts/lib/tools.ts'
import { renderIndex, renderNotFound } from '../src/render.ts'
import { toPortalInput } from './build-lib.ts'

const root = new URL('../', import.meta.url)
const dist = new URL('dist/', root)

const registry = await loadTools()
if (!registry.ok) {
  console.error(registry.error)
  process.exit(1)
}

const input = toPortalInput(registry.value)
await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await cp(new URL('public/', root), dist, { recursive: true })
// riml-ds のトークンは npm から取る（public/ にコピーを置かない＝版がずれない）
await cp(
  fileURLToPath(import.meta.resolve('@rimltempest/riml-ds-tokens/tokens.css')),
  fileURLToPath(new URL('tokens.css', dist)),
)
await writeFile(new URL('index.html', dist), renderIndex(input))
await writeFile(new URL('404.html', dist), renderNotFound(input))
console.log(`portal: ${input.tools.filter((t) => t.listed).length} tools → dist/`)
