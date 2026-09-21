/**
 * 参加者の色の決め方（`DESIGN.md` §2.2）。
 *
 * 同じ人には常に同じ色。サーバに色を持たせず、`actorId` から決めるので、
 * 誰がどの端末から入っても一致する。
 */
import { fnv1a } from './hash.ts'

/** `--noter-presence-0` 〜 `--noter-presence-7`。 */
export const PRESENCE_COLOR_COUNT = 8

export const presenceIndex = (actorId: string): number => fnv1a(actorId) % PRESENCE_COLOR_COUNT
