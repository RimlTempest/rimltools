/**
 * バンドルの内訳をパッケージ単位で出す（docs/bundle.md の表を作るための道具）。
 *
 *   NOTER_BUNDLE_ANALYZE=1 bun run --cwd products/noter build
 *   bun scripts/bundle-report.ts products/noter/apps/web/dist/server [上位件数]
 *
 * チャンクごとに gzip サイズを測り、sourcemap で文字数を各ソースに割り当て、
 * その比率で gzip サイズを按分する（推定値。圧縮率はソースごとに違うので目安）。
 */

import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { attributeBytes, packageOf, type SourceMapLike } from './lib/sourcemap-attribution.ts'

const isMap = (value: unknown): value is SourceMapLike =>
  typeof value === 'object'
  && value !== null
  && 'sources' in value
  && 'mappings' in value
  && Array.isArray(value.sources)
  && typeof value.mappings === 'string'

const kib = (bytes: number): string => (bytes / 1024).toFixed(1)

type Entry = { gzip: number; chunks: Map<string, number> }

const main = async (): Promise<number> => {
  const dir = process.argv[2]
  const top = Number(process.argv[3] ?? '20')
  if (dir === undefined) {
    console.error('usage: bun scripts/bundle-report.ts <dist dir> [top]')
    return 2
  }
  const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile() && /\.(m?js)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name))

  type Chunk = { chunk: string; gzip: number; byPackage: Map<string, number>; mapped: boolean }
  const readChunk = async (path: string): Promise<Chunk> => {
    const code = await Bun.file(path).text()
    const gzip = Bun.gzipSync(new TextEncoder().encode(code)).byteLength
    const mapFile = Bun.file(`${path}.map`)
    const raw: unknown = (await mapFile.exists()) ? await mapFile.json() : null
    const mapped = isMap(raw)
    const shares = mapped ? attributeBytes(code, raw) : new Map([['(no sourcemap)', code.length]])
    const byPackage = new Map<string, number>()
    for (const [source, n] of shares) {
      const name =
        source === '(unmapped)' || source === '(no sourcemap)' ? source : packageOf(source)
      byPackage.set(name, (byPackage.get(name) ?? 0) + n)
    }
    return { chunk: relative(dir, path), gzip, byPackage, mapped }
  }
  const chunks = await Promise.all(files.map(readChunk))

  const packages = new Map<string, Entry>()
  const total = chunks.reduce((sum, c) => sum + c.gzip, 0)
  const unmappedChunks = chunks.filter((c) => !c.mapped).length
  for (const { chunk, gzip, byPackage } of chunks) {
    const chars = [...byPackage.values()].reduce((a, b) => a + b, 0) || 1
    for (const [name, n] of byPackage) {
      const share = (gzip * n) / chars
      const entry = packages.get(name) ?? { gzip: 0, chunks: new Map() }
      entry.gzip += share
      entry.chunks.set(chunk, (entry.chunks.get(chunk) ?? 0) + share)
      packages.set(name, entry)
    }
  }

  const rows = [...packages.entries()].toSorted((a, b) => b[1].gzip - a[1].gzip).slice(0, top)
  console.log(
    `合計: ${kib(total)} KiB gzip（${files.length} チャンク、sourcemap 無し ${unmappedChunks}）\n`,
  )
  console.log('| # | パッケージ / ディレクトリ | 推定 gzip (KiB) | 割合 | 主なチャンク |')
  console.log('| --- | --- | ---: | ---: | --- |')
  rows.forEach(([name, entry], i) => {
    const topChunks = [...entry.chunks.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([c]) => `\`${c.replace(/-[A-Za-z0-9_-]{8}\.m?js$/, '')}\``)
      .join(', ')
    const pct = ((entry.gzip / total) * 100).toFixed(1)
    console.log(`| ${i + 1} | \`${name}\` | ${kib(entry.gzip)} | ${pct}% | ${topChunks} |`)
  })
  return 0
}

process.exit(await main())
