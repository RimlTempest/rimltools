import { describe, expect, test } from 'bun:test'

import { checkBudgets, parseBudgetFile } from './bundle-budget.ts'

const file = (path: string, gzipBytes: number) => ({ path, gzipBytes })

describe('parseBudgetFile', () => {
  test('reads budgets with directory, extensions and a gzip limit', () => {
    const result = parseBudgetFile({
      budgets: [
        {
          name: 'worker',
          dir: 'services/web/dist/server',
          extensions: ['.js', '.mjs', '.wasm'],
          maxGzipBytes: 2_000_000,
          reason: 'Workers Free の上限 3 MiB の 2/3',
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value[0]?.name).toBe('worker')
    expect(result.value[0]?.maxGzipBytes).toBe(2_000_000)
  })

  test('rejects a budget without a positive limit or a reason', () => {
    const noLimit = parseBudgetFile({
      budgets: [{ name: 'w', dir: 'd', extensions: ['.js'], maxGzipBytes: 0, reason: 'r' }],
    })
    expect(noLimit.ok).toBe(false)
    const noReason = parseBudgetFile({
      budgets: [{ name: 'w', dir: 'd', extensions: ['.js'], maxGzipBytes: 1 }],
    })
    expect(noReason.ok).toBe(false)
  })

  test('rejects an empty budget list and non-objects', () => {
    expect(parseBudgetFile({ budgets: [] }).ok).toBe(false)
    expect(parseBudgetFile(null).ok).toBe(false)
  })
})

describe('checkBudgets', () => {
  const budget = {
    name: 'worker',
    dir: 'dist/server',
    extensions: ['.js', '.wasm'],
    maxGzipBytes: 1000,
    reason: 'test',
  }

  test('passes when the matching files fit and reports the largest files', () => {
    const report = checkBudgets(
      [budget],
      [
        file('dist/server/index.js', 400),
        file('dist/server/assets/a.js', 300),
        file('dist/server/assets/a.css', 5000),
        file('dist/client/app.js', 5000),
      ],
    )
    expect(report.ok).toBe(true)
    const [line] = report.results
    expect(line?.totalGzipBytes).toBe(700)
    expect(line?.fileCount).toBe(2)
    expect(line?.largest.map((f) => f.path)).toEqual([
      'dist/server/index.js',
      'dist/server/assets/a.js',
    ])
  })

  test('fails when the total exceeds the limit', () => {
    const report = checkBudgets(
      [budget],
      [file('dist/server/index.js', 800), file('dist/server/x.wasm', 300)],
    )
    expect(report.ok).toBe(false)
    expect(report.results[0]?.exceeded).toBe(true)
  })

  // 名前やディレクトリを変えた瞬間に検査が素通りにならないように（qrcc の check-bundle.sh と同じ考え）
  test('fails when no file matches a budget', () => {
    const report = checkBudgets([budget], [file('dist/other/index.js', 10)])
    expect(report.ok).toBe(false)
    expect(report.results[0]?.fileCount).toBe(0)
  })

  test('does not treat a sibling directory with the same prefix as a match', () => {
    const report = checkBudgets([budget], [file('dist/server-old/index.js', 10)])
    expect(report.results[0]?.fileCount).toBe(0)
  })
})
