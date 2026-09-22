import { describe, expect, test } from 'bun:test'

import {
  checkComment,
  checkCommitMessage,
  maxHeaderFor,
  parseReviewItems,
  reviewFindings,
} from './conventional.ts'

describe('checkCommitMessage (Conventional Commits 1.0.0)', () => {
  test.each([
    'feat: add portal',
    'fix(qrcc/scan): fall back to wasm decoder',
    'feat(noter)!: drop legacy sync protocol',
    'chore(deps): bump oxlint from 1.80.0 to 1.81.0',
    'revert: feat(portal): add search',
    'docs(adr): record release flow\n\nBody text.\n\nRefs: #12',
  ])('accepts %p', (message) => {
    expect(checkCommitMessage(message)).toEqual({ ok: true, value: undefined })
  })

  test.each([
    ['Merge pull request #1 from x/y', 'type'],
    ['feat add portal', 'type'],
    ['Feat: add portal', 'type'],
    ['feature: add portal', 'type'],
    ['feat(QRCC): add', 'scope'],
    ['feat(): add', 'scope'],
    ['feat: ', 'description'],
    ['feat:add', 'description'],
    ['feat: add portal\nbody without blank line', 'blank line'],
  ])('rejects %p (%s)', (message, reason) => {
    const result = checkCommitMessage(message)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain(reason)
  })

  test('ignores git comment lines and trailing whitespace', () => {
    expect(checkCommitMessage('# Please enter the commit message\nfix: typo\n\n').ok).toBe(true)
  })

  test('rejects a header longer than 100 characters', () => {
    const result = checkCommitMessage(`feat: ${'x'.repeat(100)}`)
    expect(result.ok).toBe(false)
  })
})

describe('checkComment (Conventional Comments)', () => {
  test.each([
    'praise: great test names',
    'nitpick: trailing space',
    'suggestion (non-blocking): extract a helper',
    'issue (blocking): this throws in the domain layer',
    'question: why not Cache API here?',
    'todo (if-minor): add a test for the empty case',
    'thought: we could share this with noter',
    'chore: rerun the snapshot',
    'note: this mirrors ADR-0003',
    'issue (blocking, security): token is logged',
    '**issue (blocking):** this throws',
  ])('accepts %p', (body) => {
    expect(checkComment(body).ok).toBe(true)
  })

  test.each([
    ['LGTM', 'label'],
    ['fix this please', 'label'],
    ['Issue: capitalised label', 'label'],
    ['issue (blocker): unknown decoration', 'decoration'],
    ['issue (blocking) missing colon', 'label'],
    ['issue:', 'subject'],
  ])('rejects %p (%s)', (body, reason) => {
    const result = checkComment(body)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain(reason)
  })

  test('only the first non-empty line needs the label', () => {
    expect(checkComment('\n\nsuggestion: rename\n\nmore context here').ok).toBe(true)
  })
})

describe('reviewFindings', () => {
  const human = { type: 'User', login: 'someone' }
  const bot = { type: 'Bot', login: 'github-actions[bot]' }

  test('checks top-level human comments and non-empty review bodies only', () => {
    const findings = reviewFindings(
      [
        { body: 'LGTM', html_url: 'u1', user: human },
        { body: 'thanks, fixed', html_url: 'u2', user: human, in_reply_to_id: 1 },
        { body: 'Terraform plan', html_url: 'u3', user: bot },
        { body: 'nitpick: typo', html_url: 'u4', user: human },
      ],
      [
        { body: '', html_url: 'r1', user: human },
        { body: 'please fix', html_url: 'r2', user: human },
        { body: 'praise: nice', html_url: 'r3', user: human },
      ],
    )
    expect(findings.map((f) => f.url)).toEqual(['u1', 'r2'])
  })
})

describe('parseReviewItems', () => {
  test('keeps well-formed items and drops the rest', () => {
    const items = parseReviewItems([
      {
        body: 'praise: x',
        html_url: 'a',
        user: { type: 'User', login: 'u' },
        in_reply_to_id: null,
      },
      { body: null, html_url: 'b', user: null },
      { html_url: 'c' },
      'nope',
    ])
    expect(items.map((i) => i.html_url)).toEqual(['a', 'b'])
    expect(items[0]?.in_reply_to_id).toBeNull()
  })

  test('returns an empty list for non-arrays', () => {
    expect(parseReviewItems({ message: 'Not Found' })).toEqual([])
  })
})

describe('header length limit', () => {
  const long = `chore(deps): bump @socketsecurity/bun-security-scanner from 1.10.12 to 1.11.0 in the bun group`
  const longer = `${long}${'x'.repeat(120 - long.length)}`

  test('ordinary commits and PRs keep the 100-character limit', () => {
    expect(checkCommitMessage(`feat: ${'x'.repeat(95)}`).ok).toBe(false)
    expect(maxHeaderFor('someone')).toBe(100)
  })

  test('Dependabot PRs may use up to 120 characters', () => {
    expect(maxHeaderFor('dependabot[bot]')).toBe(120)
    expect(checkCommitMessage(long, { maxHeader: maxHeaderFor('dependabot[bot]') }).ok).toBe(true)
    expect(checkCommitMessage(longer, { maxHeader: 120 }).ok).toBe(true)
    expect(checkCommitMessage(`${longer}y`, { maxHeader: 120 }).ok).toBe(false)
  })

  test('a look-alike login does not get the exception', () => {
    expect(maxHeaderFor('dependabot')).toBe(100)
    expect(maxHeaderFor('dependabot[bot]-fake')).toBe(100)
  })
})
