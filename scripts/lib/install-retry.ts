/**
 * CI の `bun install` を、通信の一時的な失敗のときだけ再試行する（scripts/ci/bun-install.ts）。
 * install のたびに Socket の scanner（bunfig.toml）と registry に問い合わせるので、
 * 相手側の瞬断で CI が落ちることがある。lockfile の不一致や scanner が悪性と判定した
 * 場合は、何度やっても同じなので再試行しない（止めるべき失敗を再試行で覆い隠さない）。
 */

// 相手に届かなかった・相手が一時的に応答できなかったことを示す出力
const TRANSIENT = [
  /\bECONNRESET\b/,
  /\bETIMEDOUT\b/,
  /\bECONNREFUSED\b/,
  /\bEAI_AGAIN\b/,
  /\bENOTFOUND\b/,
  /socket hang up/i,
  /fetch failed/i,
  /network error/i,
  /connection refused/i,
  /(?:\bstatus|\s-)\s*(?:502|503|504)\b/,
]

// 止まるべき失敗。TRANSIENT に当たっても、これが含まれていれば再試行しない
const FATAL = [/lockfile/i, /not found/i, /fatal advisory/i, /minimumReleaseAge/i]

export const isTransientInstallFailure = (output: string): boolean =>
  !FATAL.some((pattern) => pattern.test(output))
  && TRANSIENT.some((pattern) => pattern.test(output))

const BACKOFF_MS = [10_000, 30_000, 60_000]

/** attempts 回試すときの、各再試行の前に待つ時間 */
export const planRetries = (attempts: number): number[] =>
  BACKOFF_MS.slice(0, Math.max(0, attempts - 1))
