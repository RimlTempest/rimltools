import { err, ok, type Result } from '@rimltools/contract'

/**
 * state の版を残すルール（infra/tfstate/README.md「版の保持」）。
 *
 * 次のどちらかを満たす版は消さない:
 *   - 新しい順に keepCount 個以内
 *   - 作成から keepMs 以内（ちょうど keepMs はまだ残す）
 *
 * 書き込み用の資格情報が漏れても、短時間に何度も上書きして履歴を押し出せないようにするため。
 * 残す版が maxVersions / maxBytes を超えるなら、古い版を消すのではなく書き込みを拒否する（fail-closed）。
 */
export type RetentionPolicy = {
  keepCount: number
  keepMs: number
  maxVersions: number
  maxBytes: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * maxBytes: D1 Free は 5 GB。state は 2 つなので 1 つあたり 1 GiB までにすれば、両方が上限に
 * 達しても 2 GiB で、ロックなどの表と余裕が残る。maxVersions: state 1 つが 2 MB なら 500 版で 1 GB
 * に届く。普段は 1 日に数版しか増えないので、7 日で 500 版は明らかな異常（上書きの連打）を意味する。
 */
export const DEFAULT_RETENTION: RetentionPolicy = {
  keepCount: 20,
  keepMs: 7 * DAY_MS,
  maxVersions: 500,
  maxBytes: 1024 * 1024 * 1024,
}

export type VersionAge = { version: number; createdAt: number; size: number }

export type RetentionLimit =
  | { reason: 'too-many-versions'; kept: number; limit: number }
  | { reason: 'too-large'; keptBytes: number; limit: number }

/** 新しい版を足したあとの一覧（versions）から、消してよい版の番号を返す */
export const planRetention = (
  versions: readonly VersionAge[],
  policy: RetentionPolicy,
  now: number,
): Result<{ prune: number[] }, RetentionLimit> => {
  // 新しい順。作成時刻が同じなら版の番号が大きい方が新しい
  const newestFirst = versions.toSorted(
    (a, b) => b.createdAt - a.createdAt || b.version - a.version,
  )
  const keep = (v: VersionAge, index: number) =>
    index < policy.keepCount || now - v.createdAt <= policy.keepMs

  const kept = newestFirst.filter(keep)
  if (kept.length > policy.maxVersions) {
    return err({ reason: 'too-many-versions', kept: kept.length, limit: policy.maxVersions })
  }
  const keptBytes = kept.reduce((sum, v) => sum + v.size, 0)
  if (keptBytes > policy.maxBytes) {
    return err({ reason: 'too-large', keptBytes, limit: policy.maxBytes })
  }
  const prune = newestFirst
    .filter((v, index) => !keep(v, index))
    .map((v) => v.version)
    .toSorted((a, b) => a - b)
  return ok({ prune })
}
