/**
 * tools.json（RimlTools の台帳）を読み、検証済みの型にする。
 * CI・リリース・監視のスクリプトはこれを経由して台帳を読む（ADR-0001）。
 */
export type Result<T, E> =
  | {
      ok: true
      value: T
    }
  | {
      ok: false
      error: E
    }
export type WorkerRole = 'public' | 'internal'
export type WorkerSpec = {
  name: string
  role: WorkerRole
  buildConfig: string
  durableObjects: boolean
}
export type D1Spec = {
  name: string
  binding: string
  migrationsConfig: string
}
export type ReleaseMode = 'canary' | 'big-bang'
export type ReleaseSpec = {
  mode: ReleaseMode
  steps: number[]
  bakeMinutes: number
}
export type Tool = {
  name: string
  title: string
  description: string
  path: string
  subdomain: string
  /** true なら `<domain>` そのもので公開する（ポータル） */
  apex: boolean
  /** ポータルのツール一覧に出すか（既定 true） */
  listed: boolean
  /** 本番のホスト名（`<subdomain>.<domain>`、apex なら `<domain>`） */
  host: string
  /** staging のホスト名（`<subdomain>-staging.<domain>`、apex なら `staging.<domain>`） */
  stagingHost: string
  legacyHosts: string[]
  rust: boolean
  workers: WorkerSpec[]
  d1: D1Spec[]
  release: ReleaseSpec
  slo: {
    availability: number
    windowDays: number
  }
  smoke: {
    cli: string
    browser: string
    e2ePackage: string
  }
}
export type Registry = {
  domain: string
  zone: string
  tools: Tool[]
}
export declare const parseTools: (raw: unknown) => Result<Registry, string>
/** リポジトリ直下の tools.json を読む（I/O はここだけ）。 */
export declare const loadTools: (path?: URL) => Promise<Result<Registry, string>>
export declare const findTool: (registry: Registry, name: string) => Result<Tool, string>
//# sourceMappingURL=tools.d.ts.map
