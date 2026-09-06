/**
 * 接続状態と同期状態を 1 つの文言に畳む（docs/design/ux.md §5 の表）。
 *
 * 表は `status-text.test.ts` にそのまま写してある。文言を変えるときは
 * ux.md → テスト → ここ の順に直す。
 *
 * **「保存」という語は使わない。** ユーザーが押すものが無いので「同期」で統一する。
 * 例外は「端末に保存」（オフライン時に編集がどこにあるかを示す）。
 */
import type { RejectReason } from '@noter/sync/contract'
import type { ConnectionState } from '@noter/sync/contract'
import type { SaveState } from '../contract/save-state.ts'
import type { StatusText } from '../contract/status.ts'

/**
 * 時刻は **JST に固定する**。端末のタイムゾーンに任せると、同じ文書を
 * 開いている人どうしで違う時刻が出て「どちらが新しいか」が分からなくなる
 * （`@noter/documents/ui` の `formatDateTime` と同じ方針）。
 */
const CLOCK = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Tokyo',
})

export const clockText = (at: number): string => CLOCK.format(new Date(at))

/**
 * 拒否の理由ごとの文言。
 *
 * `bad_request` と `too_large` は ux.md §5 の表に無い（v1 の画面では起きない）。
 * 表現できない状態を残さないため、ここで補っている。
 */
const REJECTED: {
  readonly [R in RejectReason]: { readonly label: string; readonly announce: string }
} = {
  forbidden: {
    label: '権限がありません',
    announce: 'この文書の権限が変更されました。再読み込みしてください',
  },
  not_found: {
    label: '文書が見つかりません',
    announce: '文書が削除されたか、アクセスできません',
  },
  limit: {
    label: '本日の同期上限',
    announce: '本日の同期上限に達しました。編集はこの端末に保存されます',
  },
  too_large: {
    label: '文書が上限を超えました',
    announce: '文書が上限を超えたため同期できません。書き出してから分割してください',
  },
  bad_request: {
    label: '同期できません',
    announce: 'この文書と同期できませんでした。ページを再読み込みしてください',
  },
}

export const statusText = (connection: ConnectionState, save: SaveState): StatusText => {
  switch (connection.kind) {
    case 'connecting':
      return { label: '接続中…', announce: '接続しています', tone: 'muted' }

    case 'connected':
      return save.kind === 'saved'
        ? { label: `同期済み · ${clockText(save.at)}`, announce: '接続しました', tone: 'success' }
        : // 送信待ちは普通の状態なので読み上げない（読み上げが止まらなくなる）
          { label: '同期中…', announce: null, tone: 'muted' }

    case 'reconnecting':
      return {
        label: `再接続中… (${connection.attempt} 回目)`,
        announce: '再接続しています。編集は続けられます',
        tone: 'warning',
      }

    case 'offline':
      return {
        label: 'オフライン · 端末に保存',
        announce: 'オフラインです。編集はこの端末に保存され、復帰後に送信されます',
        tone: 'warning',
      }

    case 'rejected': {
      const text = REJECTED[connection.reason]
      return { label: text.label, announce: text.announce, tone: 'danger' }
    }
  }
}
