/**
 * ビルド成果物のサイズ予算を検査する（判定は scripts/lib/bundle-budget.ts）。
 *
 *   bun scripts/bundle-budget.ts apps/noter
 *
 * `<product>/bundle-budget.json` の各予算について、対象ディレクトリの中のファイルを
 * 1 つずつ gzip して合計する。1 つでも超えたら（または対象が 0 件なら）exit 1。
 * 個別に gzip した合計は、まとめて gzip した値より大きくなるので、上限の判定は安全側に倒れる。
 */

import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { checkBudgets, parseBudgetFile, type MeasuredFile } from './lib/bundle-budget.ts'

const listFiles = async (root: string, dir: string): Promise<string[]> => {
  const entries = await readdir(join(root, dir), { recursive: true, withFileTypes: true }).catch(
    () => [],
  )
  return entries.filter((e) => e.isFile()).map((e) => relative(root, join(e.parentPath, e.name)))
}

const measure = async (root: string, path: string): Promise<MeasuredFile> => {
  const bytes = await Bun.file(join(root, path)).bytes()
  return { path, gzipBytes: Bun.gzipSync(bytes).byteLength }
}

const kib = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`

const main = async (): Promise<number> => {
  const product = process.argv[2]
  if (product === undefined) {
    console.error('usage: bun scripts/bundle-budget.ts <product dir>')
    return 2
  }
  const file = Bun.file(join(product, 'bundle-budget.json'))
  if (!(await file.exists())) {
    console.error(`::error::${product}/bundle-budget.json not found`)
    return 1
  }
  const budgets = parseBudgetFile(await file.json())
  if (!budgets.ok) {
    console.error(`::error::${budgets.error}`)
    return 1
  }

  const dirs = [...new Set(budgets.value.map((b) => b.dir))]
  const paths = (await Promise.all(dirs.map((d) => listFiles(product, d)))).flat()
  const files = await Promise.all([...new Set(paths)].map((p) => measure(product, p)))
  const report = checkBudgets(budgets.value, files)

  for (const r of report.results) {
    const used = ((r.totalGzipBytes / r.budget.maxGzipBytes) * 100).toFixed(1)
    const line = `${r.budget.name}: ${kib(r.totalGzipBytes)} gzip / ${kib(r.budget.maxGzipBytes)} (${used}%, ${r.fileCount} files)`
    if (r.exceeded) {
      const why = r.fileCount === 0 ? `no file matched ${r.budget.dir}` : r.budget.reason
      console.error(`::error::${line} — ${why}`)
    } else {
      console.log(line)
    }
    for (const f of r.largest) console.log(`  ${kib(f.gzipBytes).padStart(11)}  ${f.path}`)
  }
  return report.ok ? 0 : 1
}

process.exit(await main())
