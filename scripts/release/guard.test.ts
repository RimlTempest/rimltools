import { describe, expect, test } from 'bun:test'

import { checkReleaseGuard } from './guard.ts'

describe('checkReleaseGuard', () => {
  test('main accepts develop and hotfix/* only', () => {
    expect(checkReleaseGuard({ base: 'main', head: 'develop', labels: [], titles: [] })).toEqual([])
    expect(
      checkReleaseGuard({ base: 'main', head: 'hotfix/login', labels: [], titles: [] }),
    ).toEqual([])
    expect(
      checkReleaseGuard({ base: 'main', head: 'feature/x', labels: [], titles: [] }),
    ).toHaveLength(1)
  })

  test('develop accepts any branch except main', () => {
    expect(
      checkReleaseGuard({ base: 'develop', head: 'feature/x', labels: [], titles: [] }),
    ).toEqual([])
    expect(
      checkReleaseGuard({ base: 'develop', head: 'main', labels: [], titles: [] }),
    ).toHaveLength(0)
  })

  test('release-freeze only lets fix and revert commits reach main', () => {
    const input = {
      base: 'main',
      head: 'develop',
      labels: ['release-freeze'],
      titles: ['fix(qrcc): x', 'revert: y', 'feat(noter): z', 'Merge pull request #3'],
    }
    const problems = checkReleaseGuard(input)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('feat(noter): z')
  })
})
