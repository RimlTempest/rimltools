/**
 * D1 migration の guard（ADR-0003）。
 * 新旧の版が同時に動くので、破壊的変更（DROP / RENAME）は contract 段階として
 * 先頭に `-- contract: <理由>` を書いたものだけを許す。
 */
export type MigrationFile = { path: string; content: string }
export type Violation = { path: string; statement: string }

const destructive = [
  /\bdrop\s+(table|index|view|trigger)\b/i,
  /\balter\s+table\s+\S+\s+drop\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
]

const stripComments = (sql: string): string =>
  sql.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/--[^\n]*/g, ' ')

export const checkMigrations = (files: MigrationFile[]): Violation[] =>
  files.flatMap((file) => {
    const firstLine = file.content.trimStart().split('\n')[0] ?? ''
    if (/^--\s*contract:/i.test(firstLine)) return []
    const body = stripComments(file.content)
    const hit = destructive.map((re) => re.exec(body)?.[0]).find((m) => m !== undefined)
    return hit === undefined ? [] : [{ path: file.path, statement: hit }]
  })
