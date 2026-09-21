import { describe, expect, test } from 'bun:test'

import { decideFreeze, decideIncident, decideQuotaIssue } from './incident.ts'

describe('decideIncident', () => {
  test('opens an issue on a confirmed failure', () => {
    expect(decideIncident({ failing: true, openIssue: null })).toEqual({ kind: 'open' })
  })
  test('comments on the open issue while still failing', () => {
    expect(decideIncident({ failing: true, openIssue: 12 })).toEqual({ kind: 'comment', issue: 12 })
  })
  test('closes the open issue after recovery', () => {
    expect(decideIncident({ failing: false, openIssue: 12 })).toEqual({ kind: 'close', issue: 12 })
  })
  test('does nothing when healthy and nothing is open', () => {
    expect(decideIncident({ failing: false, openIssue: null })).toEqual({ kind: 'none' })
  })
})

describe('decideFreeze', () => {
  test('opens a freeze when a budget is exhausted', () => {
    expect(decideFreeze({ exhausted: ['qrcc'], openIssue: null })).toEqual({ kind: 'open' })
  })
  test('comments instead of opening a second freeze', () => {
    expect(decideFreeze({ exhausted: ['qrcc'], openIssue: 3 })).toEqual({
      kind: 'comment',
      issue: 3,
    })
  })
  test('never lifts a freeze automatically; it only reports recovery', () => {
    expect(decideFreeze({ exhausted: [], openIssue: 3 })).toEqual({ kind: 'recovered', issue: 3 })
    expect(decideFreeze({ exhausted: [], openIssue: null })).toEqual({ kind: 'none' })
  })
})

describe('decideQuotaIssue', () => {
  test('opens once, then comments while above the threshold', () => {
    expect(decideQuotaIssue({ alerting: true, openIssue: null })).toEqual({ kind: 'open' })
    expect(decideQuotaIssue({ alerting: true, openIssue: 5 })).toEqual({
      kind: 'comment',
      issue: 5,
    })
    expect(decideQuotaIssue({ alerting: false, openIssue: 5 })).toEqual({ kind: 'close', issue: 5 })
  })
})
