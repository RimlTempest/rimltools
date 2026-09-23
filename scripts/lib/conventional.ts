/**
 * Conventional Commits 1.0.0 と Conventional Comments の検査（docs/conventions.md）。
 * lefthook の commit-msg と CI（conventional.yml）が同じ関数を使う。
 */

import type { Result } from './tools.ts'

export const COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
] as const

export const COMMENT_LABELS = [
  'praise',
  'nitpick',
  'suggestion',
  'issue',
  'todo',
  'question',
  'thought',
  'chore',
  'note',
] as const

export const COMMENT_DECORATIONS = [
  'blocking',
  'non-blocking',
  'if-minor',
  'security',
  'a11y',
  'perf',
  'test',
  'ux',
] as const

const MAX_HEADER = 100

// Dependabot のグループ PR の件名（`chore(deps): bump <依存> from <版> to <版> in the <グループ> group`）は
// 依存名と版の長さで 100 文字を超えることがある（#36）。件名を短くする手段が無いので、
// Dependabot が作った PR だけ上限を緩める。人が書く件名の上限は変えない。
const DEPENDABOT_LOGIN = 'dependabot[bot]'
const DEPENDABOT_MAX_HEADER = 120

/** PR を作ったアカウントに応じた件名の上限 */
export const maxHeaderFor = (author: string): number =>
  author === DEPENDABOT_LOGIN ? DEPENDABOT_MAX_HEADER : MAX_HEADER

/**
 * PR の中の 1 コミットずつを検査するか。
 *
 * `develop` → `main` のリリース PR は、develop に入るときに検査済みのコミットを
 * まとめて出すだけなので見ない（PR タイトルは引き続き検査する）。ここで再検査すると、
 * 過去に 1 件でも違反があるとそれ以降のリリースが全部止まってしまう。
 */
export const checksEveryCommit = (baseRef: string): boolean => baseRef !== 'main'

export type CommitCheckOptions = { maxHeader?: number }

const ok: Result<void, string> = { ok: true, value: undefined }
const fail = (error: string): Result<void, string> => ({ ok: false, error })

const includes = <T extends string>(list: readonly T[], value: string): value is T =>
  list.some((item) => item === value)

// <type>(<scope>)!: <description>
const HEADER = /^(?<type>[^(!:\s]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:(?<rest>.*)$/
const SCOPE = /^[a-z0-9][a-z0-9/-]*$/

export const checkCommitMessage = (
  message: string,
  options: CommitCheckOptions = {},
): Result<void, string> => {
  const maxHeader = options.maxHeader ?? MAX_HEADER
  const lines = message
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .map((line) => line.trimEnd())
  while (lines.length > 0 && lines.at(-1) === '') lines.pop()

  const header = lines[0] ?? ''
  const match = HEADER.exec(header)
  const groups = match?.groups
  if (groups === undefined) {
    return fail(`type: header must look like "<type>(<scope>): <description>", got "${header}"`)
  }
  const type = groups['type'] ?? ''
  if (!includes(COMMIT_TYPES, type)) {
    return fail(`type: "${type}" is not one of ${COMMIT_TYPES.join(', ')}`)
  }
  const scope = groups['scope']
  if (scope !== undefined && !SCOPE.test(scope)) {
    return fail(`scope: "${scope}" must be lowercase letters, digits, "-" or "/"`)
  }
  const rest = groups['rest'] ?? ''
  if (!rest.startsWith(' ') || rest.trim() === '') {
    return fail('description: put one space after ":" and write a description')
  }
  if (header.length > maxHeader) {
    return fail(`header: keep it within ${maxHeader} characters (got ${header.length})`)
  }
  if (lines.length > 1 && lines[1] !== '') {
    return fail('blank line: separate the header and the body with a blank line')
  }
  return ok
}

// <label> [(decorations)]: <subject>。太字（**label:**）も許す
const COMMENT =
  /^(?:\*\*)?(?<label>[a-z-]+)(?: \((?<decorations>[^)]*)\))?:(?:\*\*)?(?<subject>.*)$/

export const checkComment = (body: string): Result<void, string> => {
  const first = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '')
  const groups = COMMENT.exec(first ?? '')?.groups
  const label = groups?.['label'] ?? ''
  if (groups === undefined || !includes(COMMENT_LABELS, label)) {
    return fail(
      `label: start with "<label> [(decorations)]: <subject>" where label is one of ${COMMENT_LABELS.join(', ')}`,
    )
  }
  const decorations = (groups['decorations'] ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d !== '')
  const unknown = decorations.filter((d) => !includes(COMMENT_DECORATIONS, d))
  if (unknown.length > 0) {
    return fail(
      `decoration: unknown ${unknown.join(', ')} (allowed: ${COMMENT_DECORATIONS.join(', ')})`,
    )
  }
  if ((groups['subject'] ?? '').trim() === '') {
    return fail('subject: write what the comment is about after ":"')
  }
  return ok
}

export type GitHubUser = { type: string; login: string }

/** GitHub API の review comment / review のうち、検査に使う項目だけ */
export type ReviewItem = {
  body: string | null
  html_url: string
  user: GitHubUser | null
  in_reply_to_id?: number | null
}

export type Finding = { url: string; author: string; error: string }

/**
 * 検査対象: 人が書いたスレッド先頭の review comment と、本文のある review。
 * 返信（in_reply_to_id あり）と bot の投稿は対象外。
 */
const byHuman = (item: ReviewItem) => item.user !== null && item.user.type !== 'Bot'

export const reviewFindings = (comments: ReviewItem[], reviews: ReviewItem[]): Finding[] => {
  const targets = [
    ...comments.filter((c) => byHuman(c) && (c.in_reply_to_id ?? undefined) === undefined),
    ...reviews.filter((r) => byHuman(r) && (r.body ?? '').trim() !== ''),
  ]
  return targets.flatMap((item) => {
    const result = checkComment(item.body ?? '')
    if (result.ok) return []
    return [{ url: item.html_url, author: item.user?.login ?? 'unknown', error: result.error }]
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseUser = (value: unknown): GitHubUser | null | undefined => {
  if (value === null) return null
  if (!isRecord(value)) return undefined
  const { type, login } = value
  return typeof type === 'string' && typeof login === 'string' ? { type, login } : undefined
}

/** GitHub API の応答（unknown）から ReviewItem を取り出す。形の合わないものは捨てる。 */
export const parseReviewItems = (raw: unknown): ReviewItem[] => {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item: unknown) => {
    if (!isRecord(item)) return []
    const { body, html_url: url, in_reply_to_id: replyTo } = item
    const user = parseUser(item['user'])
    if (typeof url !== 'string' || user === undefined) return []
    if (body !== null && typeof body !== 'string') return []
    const base = { body, html_url: url, user }
    if (typeof replyTo === 'number' || replyTo === null)
      return [{ ...base, in_reply_to_id: replyTo }]
    return [base]
  })
}
