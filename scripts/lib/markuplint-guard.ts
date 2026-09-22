/**
 * markuplint の実行結果を判定する（tools/markuplint/run.ts が使う）。
 *
 * markuplint は、parser が当たらなかったファイルを黙って飛ばし exit 0 で終わる。
 * 実際に 2026-09 まで、overrides の既定動作（overrideMode: "reset"）で JSX parser が外れ、
 * .tsx が 1 つも検査されていなかった。ここでは「対象に一致したファイル」がすべて
 * 検査済み（processed）であることを確かめ、空振りを失敗にする。
 */

export type Severity = 'error' | 'warning' | 'info'

export type Violation = {
  severity: Severity
  ruleId: string
  message: string
  line: number
  col: number
}

export type FileOutcome = {
  path: string
  /** processed: 検査した / skipped: markuplint が飛ばした / unresolved: 対象にできなかった */
  status: 'processed' | 'skipped' | 'unresolved'
  violations: Violation[]
}

export type RunInput = {
  /** 対象パターンに一致したファイル */
  matched: string[]
  outcomes: FileOutcome[]
  /** 対象 0 件を許す（pre-commit で .tsx がステージされていないとき） */
  allowEmpty: boolean
}

export type Verdict = { exitCode: 0 | 1; lines: string[]; summary: string }

export const judgeMarkuplintRun = ({ matched, outcomes, allowEmpty }: RunInput): Verdict => {
  const lines: string[] = []
  const byPath = new Map(outcomes.map((o) => [o.path, o]))

  const notLinted = matched.filter((path) => byPath.get(path)?.status !== 'processed')
  for (const path of notLinted) lines.push(`not linted: ${path}`)

  const linted = outcomes.filter((o) => o.status === 'processed')
  let errors = 0
  let warnings = 0
  for (const outcome of linted) {
    for (const v of outcome.violations) {
      if (v.severity === 'error') errors += 1
      else warnings += 1
      lines.push(`${outcome.path}:${v.line}:${v.col} ${v.severity} ${v.message} (${v.ruleId})`)
    }
  }

  const empty = matched.length === 0
  if (empty && !allowEmpty) {
    lines.push('no files matched the patterns: markuplint would check nothing')
  }

  const summary = `markuplint: ${linted.length} files linted, ${errors} errors, ${warnings} warnings`
  const failed = (empty && !allowEmpty) || notLinted.length > 0 || errors > 0
  return { exitCode: failed ? 1 : 0, lines, summary }
}
