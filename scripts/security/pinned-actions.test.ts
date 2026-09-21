import { describe, expect, test } from 'bun:test'

import { findUnpinnedUses } from './pinned-actions.ts'

const SHA = '0123456789abcdef0123456789abcdef01234567'

describe('findUnpinnedUses', () => {
  test('accepts a full commit SHA with a version comment', () => {
    const yml = `steps:\n  - uses: actions/checkout@${SHA} # v5.1.0\n`
    expect(findUnpinnedUses('a.yml', yml)).toEqual([])
  })

  test('rejects tags and branches', () => {
    const yml = 'steps:\n  - uses: actions/checkout@v5\n  - uses: foo/bar@main\n'
    const found = findUnpinnedUses('a.yml', yml)
    expect(found.map((f) => f.line)).toEqual([2, 3])
    expect(found[0]?.reason).toContain('not pinned to a 40-character commit SHA')
  })

  test('rejects a SHA without a version comment (Dependabot needs it to update)', () => {
    const yml = `  - uses: actions/checkout@${SHA}\n`
    const [found] = findUnpinnedUses('a.yml', yml)
    expect(found?.reason).toContain('version comment')
  })

  test('rejects short SHAs', () => {
    const yml = '  - uses: actions/checkout@0123456 # v5\n'
    expect(findUnpinnedUses('a.yml', yml)).toHaveLength(1)
  })

  test('allows local actions, reusable workflows and digest-pinned docker images', () => {
    const yml = [
      '    uses: ./.github/workflows/qrcc-ci.yml',
      '  - uses: ./.github/actions/setup',
      `  - uses: docker://ghcr.io/foo/bar@sha256:${'a'.repeat(64)}`,
    ].join('\n')
    expect(findUnpinnedUses('a.yml', yml)).toEqual([])
  })

  test('rejects docker images pinned by tag', () => {
    const yml = '  - uses: docker://alpine:3.20\n'
    expect(findUnpinnedUses('a.yml', yml)).toHaveLength(1)
  })

  test('handles quoted values', () => {
    const yml = `  - uses: "actions/checkout@${SHA}" # v5.1.0\n  - uses: 'foo/bar@v1'\n`
    expect(findUnpinnedUses('a.yml', yml).map((f) => f.line)).toEqual([2])
  })

  test('ignores commented-out lines', () => {
    const yml = '  # - uses: actions/checkout@v5\n'
    expect(findUnpinnedUses('a.yml', yml)).toEqual([])
  })
})
