import type { Tool, WorkerSpec } from '../lib/tools.ts'
import type { EnvName } from './environment.ts'

export type Strategy =
  /** 0% で並べて override で検証 → steps の割合で段階的に切り替える */
  | { kind: 'canary'; steps: number[]; bakeMinutes: number }
  /**
   * `wrangler deploy` で一括。Durable Object を持つ Worker は、オブジェクトごとに
   * 同時 1 版しか動かず DO の migration も versions upload では適用できないため（ADR-0003）。
   */
  | { kind: 'direct' }

export type WorkerPlan = { worker: WorkerSpec; strategy: Strategy }

const straight: Strategy = { kind: 'canary', steps: [100], bakeMinutes: 0 }

/** 下流（internal）から順に出す。上流の新版は下流の旧版とも動く前提（ADR-0003） */
export const planRollout = (tool: Tool, env: EnvName): WorkerPlan[] => {
  const ordered = [
    ...tool.workers.filter((w) => w.role === 'internal'),
    ...tool.workers.filter((w) => w.role === 'public'),
  ]
  return ordered.map((worker) => {
    if (worker.durableObjects) return { worker, strategy: { kind: 'direct' } }
    if (env !== 'production' || tool.release.mode === 'big-bang')
      return { worker, strategy: straight }
    return {
      worker,
      strategy: {
        kind: 'canary',
        steps: tool.release.steps,
        bakeMinutes: tool.release.bakeMinutes,
      },
    }
  })
}
