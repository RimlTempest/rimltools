import type { Result } from '@rimltools/contract'

import type { Lock } from './core/lock.ts'
import type { StateMeta } from './core/guard.ts'

export type VersionInfo = {
  version: number
  serial: number
  lineage: string
  size: number
  createdAt: number
}

export type LockAttempt = { acquired: true } | { acquired: false; holder: Lock }

/**
 * state の置き場所。I/O はここの実装（D1 / メモリ）だけに閉じる。
 * 削除の操作は持たない。書き込み用の資格情報が漏れても、state と版の履歴を消せないようにするため
 * （消すときは人が wrangler d1 execute で行う。docs/runbooks/tfstate-restore.md）
 */
export type StateStore = {
  getState: (path: string) => Promise<Result<string | null, string>>
  putState: (
    path: string,
    body: string,
    meta: StateMeta,
    now: number,
  ) => Promise<Result<void, string>>
  listVersions: (path: string) => Promise<Result<VersionInfo[], string>>
  getLock: (path: string, now: number) => Promise<Result<Lock | null, string>>
  /** 期限切れ（expires_at <= now）のロックは奪える */
  acquireLock: (
    path: string,
    lock: Lock,
    expiresAt: number,
    now: number,
  ) => Promise<Result<LockAttempt, string>>
  /** 持ち主の ID と一致したときだけ外す。外れたら true、他人のロックなら false */
  releaseLock: (path: string, id: string) => Promise<Result<boolean, string>>
}

// D1 のうち、このストアが使う部分だけ（テストでは bun:sqlite で模す）
export type D1Value = string | number | null
export type D1Row = Record<string, unknown>
export type D1Stmt = {
  bind: (...values: D1Value[]) => D1Stmt
  first: () => Promise<D1Row | null>
  all: () => Promise<{ results: D1Row[] }>
  run: () => Promise<{ meta: { changes: number } }>
}
// batch はメソッド記法にする。本物の D1Database.batch は D1PreparedStatement[] を受け取るので、
// 引数を双変で比べるメソッド記法でないと代入できない（渡すのは常に prepare() が返したもの）
export type D1Like = {
  prepare(sql: string): D1Stmt
  batch(statements: D1Stmt[]): Promise<{ meta: { changes: number } }[]>
}
