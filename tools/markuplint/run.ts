/**
 * markuplint のラッパー。`node tools/markuplint/run.ts --config <file> [--allow-empty] <glob|file>...`
 *
 * TypeScript 6 に固定した隔離インストール（ADR-0006）の markuplint を API で動かし、
 * 対象に一致したファイルがすべて実際に検査されたかを確かめる（scripts/lib/markuplint-guard.ts）。
 * markuplint の CLI は parser が当たらないファイルを黙って飛ばして exit 0 で終わるため、
 * CLI を直接呼ばない。Node の型除去で動くよう、erasable な構文だけで書く。
 */

import { access, glob } from 'node:fs/promises'
import path from 'node:path'

import { MLEngine } from 'markuplint'

import { judgeMarkuplintRun, type FileOutcome } from '../../scripts/lib/markuplint-guard.ts'

const TARGET = /\.(tsx|jsx|html)$/
const IGNORED = /(^|\/)(node_modules|dist|\.output)\//

const parseArgs = (argv: string[]) => {
  let configFile = ''
  let allowEmpty = false
  const targets: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    if (arg === '--config') {
      configFile = argv[i + 1] ?? ''
      i += 1
    } else if (arg === '--allow-empty') {
      allowEmpty = true
    } else {
      targets.push(arg)
    }
  }
  return { configFile, allowEmpty, targets }
}

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  )

const collect = async (
  iterator: AsyncIterator<string>,
  found: string[] = [],
): Promise<string[]> => {
  const next = await iterator.next()
  if (next.done === true) return found
  return collect(iterator, [...found, next.value])
}

const expandOne = async (target: string): Promise<string[]> => {
  if (/[*?{[]/.test(target)) return collect(glob(target)[Symbol.asyncIterator]())
  return (await exists(target)) ? [target] : []
}

const expand = async (targets: string[]): Promise<string[]> => {
  const lists = await Promise.all(targets.map(expandOne))
  const files = new Set(lists.flat().map((file) => file.split(path.sep).join('/')))
  return [...files].filter((file) => TARGET.test(file) && !IGNORED.test(file)).toSorted()
}

const lintOne = async (file: string, configFile: string): Promise<FileOutcome> => {
  const mlFile = await MLEngine.toMLFile(path.resolve(file))
  if (mlFile === undefined) return { path: file, status: 'unresolved', violations: [] }
  const engine = new MLEngine(mlFile, { configFile: path.resolve(configFile) })
  const result = await engine.exec()
  await engine.close()
  if (result === null) return { path: file, status: 'skipped', violations: [] }
  return {
    path: file,
    status: result.status,
    violations: result.violations.map((v) => ({
      severity: v.severity,
      ruleId: v.ruleId,
      message: v.message,
      line: v.line,
      col: v.col,
    })),
  }
}

const { configFile, allowEmpty, targets } = parseArgs(process.argv.slice(2))
if (configFile === '') {
  console.error(
    'usage: node tools/markuplint/run.ts --config <file> [--allow-empty] <glob|file>...',
  )
  process.exit(2)
}

const matched = await expand(targets)
// markuplint は設定と parser をファイルごとに解決するので、並列にせず順に回す
const lintAll = async (files: string[], done: FileOutcome[] = []): Promise<FileOutcome[]> => {
  const [file, ...rest] = files
  if (file === undefined) return done
  return lintAll(rest, [...done, await lintOne(file, configFile)])
}
const outcomes = await lintAll(matched)

const verdict = judgeMarkuplintRun({ matched, outcomes, allowEmpty })
for (const line of verdict.lines) console.error(line)
console.error(verdict.summary)
process.exit(verdict.exitCode)
