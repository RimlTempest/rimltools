/**
 * awareness のバイト列を読み書きする純粋関数（`docs/realtime-protocol.md` §3）。
 *
 * サーバは y-protocols の `Awareness` クラスを持たない。あれは内部でタイマーを回して
 * 生存確認をするため、DO の hibernation を妨げる（ADR-0003）。
 * DO に必要なのは「誰の状態か」を読むことと、「離脱した」を組み立てることだけ。
 *
 * awareness update の形式（y-protocols/awareness）:
 *   varUint(件数) [ varUint(clientId) varUint(clock) varString(JSON.stringify(state)) ]*
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'

export type AwarenessEntry = {
  readonly clientId: number
  readonly clock: number
}

/** `state = null` を表す JSON。y-protocols は `JSON.parse` した結果で判定する。 */
const NULL_STATE = 'null'

/**
 * 参加者の clientId と clock を読む。
 * 壊れたバイト列（切り詰め・別形式）では空配列を返す。中継しているのは
 * クライアント由来のバイト列なので、read が落ちても部屋を落とさない。
 */
export const readClientIds = (update: Uint8Array): readonly AwarenessEntry[] => {
  try {
    const decoder = decoding.createDecoder(update)
    const length = decoding.readVarUint(decoder)
    const entries: AwarenessEntry[] = []
    for (let index = 0; index < length; index += 1) {
      const clientId = decoding.readVarUint(decoder)
      const clock = decoding.readVarUint(decoder)
      decoding.readVarString(decoder)
      entries.push({ clientId, clock })
    }
    return entries
  } catch {
    return []
  }
}

/**
 * 「この参加者はもういない」を表す awareness update を組み立てる。
 *
 * clock を 1 進めた `state = null` を送ることで、受け取った側は
 * 自分が持っている状態より新しいと判断して削除する。
 */
export const encodeRemoval = (entries: readonly AwarenessEntry[]): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, entries.length)
  for (const entry of entries) {
    encoding.writeVarUint(encoder, entry.clientId)
    encoding.writeVarUint(encoder, entry.clock + 1)
    encoding.writeVarString(encoder, NULL_STATE)
  }
  return encoding.toUint8Array(encoder)
}
