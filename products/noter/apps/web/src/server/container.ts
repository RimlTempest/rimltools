/**
 * Composition root。ここだけが具体実装と env を知っている。
 *
 * ルートや server function は `Container` の関数を受け取るだけで、
 * `env` や service binding を直接触らない（.claude/skills/noter-architecture）。
 */

// TODO(plan 002 / 004): env から repo / service binding クライアントを組み立てる。
export type Container = Record<never, never>
