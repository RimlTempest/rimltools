/**
 * Conventional Commits / Conventional Comments の検査 CLI（docs/conventions.md）。
 *
 *   bun scripts/conventional.ts commit-msg <file>   lefthook の commit-msg
 *   bun scripts/conventional.ts pr                  PR タイトルと PR 内コミット（CI）
 *   bun scripts/conventional.ts comments            PR のレビューコメント（CI）
 */

import { $ } from 'bun'

import {
  checkCommitMessage,
  parseReviewItems,
  reviewFindings,
  type Finding,
  type ReviewItem,
} from './lib/conventional.ts'

const HINT_COMMIT = 'See docs/conventions.md (Conventional Commits 1.0.0).'
const HINT_COMMENT =
  'Start review comments with "<label> [(decorations)]: <subject>", e.g. "issue (blocking): ...". See docs/conventions.md.'

const env = (name: string): string => process.env[name] ?? ''

const commitMsg = async (file: string | undefined): Promise<number> => {
  if (file === undefined) {
    console.error('usage: conventional.ts commit-msg <file>')
    return 2
  }
  const result = checkCommitMessage(await Bun.file(file).text())
  if (result.ok) return 0
  console.error(`Commit message is not a Conventional Commit: ${result.error}\n${HINT_COMMIT}`)
  return 1
}

const pr = async (): Promise<number> => {
  const failures: string[] = []
  const title = checkCommitMessage(env('PR_TITLE'))
  if (!title.ok) failures.push(`PR title (becomes the merge commit): ${title.error}`)

  const base = env('BASE_SHA')
  const head = env('HEAD_SHA')
  if (base !== '' && head !== '') {
    // マージコミット（develop の取り込み等）は GitHub が作るので対象外
    const log = await $`git log --no-merges --format=%H%x1f%B%x1e ${base}..${head}`.text()
    for (const entry of log.split('\x1e')) {
      const [sha = '', body = ''] = entry.trim().split('\x1f')
      if (sha === '') continue
      const result = checkCommitMessage(body)
      if (!result.ok) failures.push(`commit ${sha.slice(0, 8)}: ${result.error}`)
    }
  }

  for (const failure of failures) console.error(`::error::${failure}`)
  if (failures.length === 0) console.log('PR title and commits follow Conventional Commits.')
  else console.error(HINT_COMMIT)
  return failures.length === 0 ? 0 : 1
}

const MAX_PAGES = 10

// ページ送りは前のページの件数で止めるので逐次に取る
const fetchAll = async (path: string, page = 1): Promise<ReviewItem[]> => {
  const response = await fetch(
    `https://api.github.com/repos/${env('GITHUB_REPOSITORY')}/${path}?per_page=100&page=${page}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${env('GITHUB_TOKEN')}`,
        'x-github-api-version': '2022-11-28',
      },
    },
  )
  if (!response.ok) {
    console.error(`::error::GitHub API ${path} returned ${response.status}`)
    return []
  }
  const batch = parseReviewItems(await response.json())
  if (batch.length < 100 || page >= MAX_PAGES) return batch
  return [...batch, ...(await fetchAll(path, page + 1))]
}

const comments = async (): Promise<number> => {
  const number = env('PR_NUMBER')
  const [reviewComments, reviews] = await Promise.all([
    fetchAll(`pulls/${number}/comments`),
    fetchAll(`pulls/${number}/reviews`),
  ])
  const findings: Finding[] = reviewFindings(reviewComments, reviews)
  for (const f of findings) console.error(`::error::${f.author} ${f.url} — ${f.error}`)
  if (findings.length === 0) console.log('Review comments follow Conventional Comments.')
  else console.error(HINT_COMMENT)
  return findings.length === 0 ? 0 : 1
}

const [command, arg] = process.argv.slice(2)
const code =
  command === 'commit-msg'
    ? await commitMsg(arg)
    : command === 'pr'
      ? await pr()
      : command === 'comments'
        ? await comments()
        : 2
if (code === 2 && command !== 'commit-msg') {
  console.error('usage: conventional.ts <commit-msg <file> | pr | comments>')
}
process.exit(code)
