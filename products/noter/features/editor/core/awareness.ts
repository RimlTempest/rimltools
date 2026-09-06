/**
 * awareness の state を画面が扱える形に直す（`docs/realtime-protocol.md` §5）。
 *
 * 中身は他の参加者が送ってきた**信用できない値**なので、必ず読み直す。
 * 読めないものは落とす（誰か分からない丸を出さない）。
 *
 * `user` の形は y-codemirror.next のリモートカーソルが読む形に合わせてある
 * （`name` / `color` / `colorLight`）。色は生の値ではなくトークンを参照させる
 * ので、テーマを切り替えるとカーソルの色も追随する。
 */
import type { Peer } from '../contract/peer.ts'

export type LocalPresenceState = {
  readonly name: string
  /** `--noter-presence-N` の N。参加者一覧のアバターが読む。 */
  readonly index: number
  /** リモートカーソルのキャレット色。 */
  readonly color: string
  /** リモートカーソルの選択範囲の色。 */
  readonly colorLight: string
}

export const localPresenceState = (name: string, colorIndex: number): LocalPresenceState => ({
  name,
  index: colorIndex,
  color: `var(--noter-presence-${colorIndex})`,
  colorLight: `color-mix(in oklab, var(--noter-presence-${colorIndex}) 24%, transparent)`,
})

const readUser = (
  state: unknown,
): { readonly name: string; readonly index: number } | undefined => {
  if (typeof state !== 'object' || state === null) return undefined
  const user: unknown = Reflect.get(state, 'user')
  if (typeof user !== 'object' || user === null) return undefined
  const name: unknown = Reflect.get(user, 'name')
  if (typeof name !== 'string' || name === '') return undefined
  const index: unknown = Reflect.get(user, 'index')
  return { name, index: typeof index === 'number' && Number.isInteger(index) ? index : 0 }
}

/** 自分以外の参加者。`clientId` 順に並べて、並び替わりでちらつかせない。 */
export const readPeers = (
  states: Iterable<readonly [number, unknown]>,
  selfClientId: number,
): readonly Peer[] => {
  const peers: Peer[] = []
  for (const [clientId, state] of states) {
    if (clientId === selfClientId) continue
    const user = readUser(state)
    if (user === undefined) continue
    peers.push({ clientId, name: user.name, colorIndex: user.index })
  }
  return peers.toSorted((left, right) => left.clientId - right.clientId)
}
