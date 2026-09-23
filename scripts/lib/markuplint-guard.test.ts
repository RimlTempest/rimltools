import { describe, expect, test } from 'bun:test'

import { judgeMarkuplintRun, type FileOutcome } from './markuplint-guard.ts'

const processed = (path: string, violations: FileOutcome['violations'] = []): FileOutcome => ({
  path,
  status: 'processed',
  violations,
})

describe('judgeMarkuplintRun', () => {
  test('passes when every matched file was linted without errors', () => {
    const verdict = judgeMarkuplintRun({
      matched: ['a.tsx', 'b.tsx'],
      outcomes: [processed('a.tsx'), processed('b.tsx')],
      allowEmpty: false,
    })
    expect(verdict.exitCode).toBe(0)
    expect(verdict.summary).toBe('markuplint: 2 files linted, 0 errors, 0 warnings')
  })

  test('fails when no file matched the patterns (a lint that checks nothing)', () => {
    const verdict = judgeMarkuplintRun({ matched: [], outcomes: [], allowEmpty: false })
    expect(verdict.exitCode).toBe(1)
    expect(verdict.lines.join('\n')).toContain('no files matched')
  })

  test('allows an empty run when asked (pre-commit with nothing staged)', () => {
    const verdict = judgeMarkuplintRun({ matched: [], outcomes: [], allowEmpty: true })
    expect(verdict.exitCode).toBe(0)
  })

  test('fails when markuplint skipped a matched file (parser not applied)', () => {
    const verdict = judgeMarkuplintRun({
      matched: ['a.tsx', 'b.tsx'],
      outcomes: [processed('a.tsx'), { path: 'b.tsx', status: 'skipped', violations: [] }],
      allowEmpty: false,
    })
    expect(verdict.exitCode).toBe(1)
    expect(verdict.lines.join('\n')).toContain('not linted: b.tsx')
  })

  test('fails when a matched file has no outcome at all', () => {
    const verdict = judgeMarkuplintRun({
      matched: ['a.tsx', 'b.tsx'],
      outcomes: [processed('a.tsx')],
      allowEmpty: false,
    })
    expect(verdict.exitCode).toBe(1)
    expect(verdict.lines.join('\n')).toContain('not linted: b.tsx')
  })

  test('fails on errors and reports them with location and rule', () => {
    const verdict = judgeMarkuplintRun({
      matched: ['a.tsx'],
      outcomes: [
        processed('a.tsx', [
          { severity: 'error', ruleId: 'wai-aria', message: 'bad', line: 3, col: 5 },
          { severity: 'warning', ruleId: 'use-list', message: 'meh', line: 9, col: 1 },
        ]),
      ],
      allowEmpty: false,
    })
    expect(verdict.exitCode).toBe(1)
    expect(verdict.lines).toContain('a.tsx:3:5 error bad (wai-aria)')
    expect(verdict.lines).toContain('a.tsx:9:1 warning meh (use-list)')
    expect(verdict.summary).toBe('markuplint: 1 files linted, 1 errors, 1 warnings')
  })

  test('warnings alone do not fail the run', () => {
    const verdict = judgeMarkuplintRun({
      matched: ['a.tsx'],
      outcomes: [
        processed('a.tsx', [{ severity: 'warning', ruleId: 'r', message: 'm', line: 1, col: 1 }]),
      ],
      allowEmpty: false,
    })
    expect(verdict.exitCode).toBe(0)
  })
})
