/**
 * DO の内部ルート。web Worker からの binding 呼び出しでのみ使う
 * （`docs/realtime-protocol.md` §5 / §6）。
 *
 * `docs/parallel-lanes.md` の横断点表にあるとおり、**追加は 1 行**にとどめる。
 */
export const INTERNAL_ROUTES = {
  kick: '/kick',
  snapshot: '/snapshot',
} as const
