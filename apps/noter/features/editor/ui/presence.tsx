import { useId } from 'react'
import { Avatar } from '@noter/ui'
import type { Peer } from '../contract/peer.ts'

type PresenceProps = {
  /** 自分は含めない（自分の存在を自分に知らせても意味がない）。 */
  readonly peers: readonly Peer[]
}

/** ヘッダーに並べるアバターの数。これを超えたぶんは「+N」にまとめる。 */
const SHOWN = 3

/**
 * いま同じ文書を開いている人（docs/design/ux.md §4.2）。
 *
 * アバターは装飾（`aria-hidden`）で、ボタンの名前は見えている
 * 「参加者 N 人」と同じ（`DESIGN.md` §8: `aria-label` が可視テキストと
 * 違うボタンを作らない）。名前の一覧はポップオーバーで開く。
 *
 * 出入りの読み上げはここではしない。画面の `LiveRegion` が 1 回だけ告げる。
 */
export const Presence = ({ peers }: PresenceProps) => {
  const listId = useId()
  if (peers.length === 0) return null

  const shown = peers.slice(0, SHOWN)
  const rest = peers.length - shown.length

  return (
    <div className="noter-presence">
      <button type="button" className="noter-presence__toggle" popoverTarget={listId}>
        <span className="noter-presence__avatars" aria-hidden="true">
          {shown.map((peer) => (
            <Avatar key={peer.clientId} name={peer.name} colorIndex={peer.colorIndex} />
          ))}
          {rest > 0 ? <span className="noter-presence__more">{`+${rest}`}</span> : undefined}
        </span>
        {`参加者 ${peers.length} 人`}
      </button>

      <div id={listId} popover="auto" className="noter-presence__popover">
        <ul aria-label="参加者">
          {peers.map((peer) => (
            <li key={peer.clientId}>
              <Avatar name={peer.name} colorIndex={peer.colorIndex} />
              <span>{peer.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
