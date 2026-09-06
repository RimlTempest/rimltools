/**
 * 参加者の増減を読み上げる文言（docs/design/ux.md §2 原則 5）。
 *
 * **通知は入退室の 1 回だけ。** カーソルの移動は告げない（読み上げが
 * 止まらなくなる）。同じ顔ぶれのままなら `null` を返し、呼び出し側は
 * live region を触らない。
 */
import type { Peer } from '../contract/peer.ts'

const namesOnlyIn = (target: readonly Peer[], other: readonly Peer[]): readonly string[] => {
  const known = new Set(other.map((peer) => peer.clientId))
  return target.filter((peer) => !known.has(peer.clientId)).map((peer) => peer.name)
}

const sentence = (names: readonly string[], verb: string): string | null =>
  names.length === 0 ? null : `${names.join('、')}さんが${verb}`

export const joinedMessage = (previous: readonly Peer[], next: readonly Peer[]): string | null =>
  sentence(namesOnlyIn(next, previous), '参加しました')

export const leftMessage = (previous: readonly Peer[], next: readonly Peer[]): string | null =>
  sentence(namesOnlyIn(previous, next), '退出しました')
