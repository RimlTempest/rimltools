/**
 * main / develop 宛て PR の出入口の検査（ADR-0002 / ADR-0007）。
 * - main に入れてよいのは develop（Release PR）と hotfix/* だけ
 * - release-freeze 中は fix / revert 以外のコミットを main に入れない
 */
export type GuardInput = { base: string; head: string; labels: string[]; titles: string[] }

const allowedDuringFreeze = /^(fix|revert)(\(.+\))?!?:/
const mergeCommit = /^Merge (pull request|branch)/

export const checkReleaseGuard = (input: GuardInput): string[] => {
  const problems: string[] = []
  if (input.base === 'main' && input.head !== 'develop' && !input.head.startsWith('hotfix/')) {
    problems.push(
      `main accepts pull requests from develop or hotfix/* only (got ${input.head}). Target develop instead.`,
    )
  }
  if (input.base === 'main' && input.labels.includes('release-freeze')) {
    const blocked = input.titles.filter((t) => !mergeCommit.test(t) && !allowedDuringFreeze.test(t))
    for (const title of blocked) {
      problems.push(
        `release-freeze: only fix/revert may reach main while the error budget is exhausted: ${title}`,
      )
    }
  }
  return problems
}
