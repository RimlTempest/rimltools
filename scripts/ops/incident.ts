/**
 * Issue をどう動かすかの判定（I/O は呼び出し側）。
 * - incident: synthetic が連続で失敗したら起票、回復したら close
 * - release-freeze: バジェット枯渇で起票。**自動では解除しない**（解除は人が判断して close）
 * - free-tier: 無料枠の閾値超えで起票、下回ったら close
 */

export type IssueAction =
  | { kind: 'open' }
  | { kind: 'comment'; issue: number }
  | { kind: 'close'; issue: number }
  | { kind: 'none' }

export type FreezeAction =
  | { kind: 'open' }
  | { kind: 'comment'; issue: number }
  | { kind: 'recovered'; issue: number }
  | { kind: 'none' }

const toggle = (active: boolean, openIssue: number | null): IssueAction => {
  if (active) return openIssue === null ? { kind: 'open' } : { kind: 'comment', issue: openIssue }
  return openIssue === null ? { kind: 'none' } : { kind: 'close', issue: openIssue }
}

export const decideIncident = (input: {
  failing: boolean
  openIssue: number | null
}): IssueAction => toggle(input.failing, input.openIssue)

export const decideQuotaIssue = (input: {
  alerting: boolean
  openIssue: number | null
}): IssueAction => toggle(input.alerting, input.openIssue)

export const decideFreeze = (input: {
  exhausted: string[]
  openIssue: number | null
}): FreezeAction => {
  const { exhausted, openIssue } = input
  if (exhausted.length > 0)
    return openIssue === null ? { kind: 'open' } : { kind: 'comment', issue: openIssue }
  return openIssue === null ? { kind: 'none' } : { kind: 'recovered', issue: openIssue }
}
