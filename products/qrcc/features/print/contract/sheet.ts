/**
 * ラベル台紙の型。
 *
 * **物理寸法の定義元は `features/print/core/sheets/` の 1 台紙 1 ファイル。**
 * ここには「どんな台紙がありうるか」（`LabelSheetId`）と、
 * 画面に出す説明（`LABEL_SHEET_META`）だけを置く。
 * 寸法を CSS 側に書き写すことはしない（ADR-0005 の帰結）。
 */
import type { Result } from '@qrcc/contract'
import { err, ok } from '@qrcc/contract'

/**
 * ミリメートル。台紙の寸法はすべてこの単位で持ち、CSS には `mm` として渡す。
 * 印刷は物理寸法が正なので、px に換算しない。
 */
export type Millimeter = number

/** 上下左右。`margin: 12.9mm 0` のような CSS の並び順に合わせる。 */
export type Edges<T> = {
  readonly top: T
  readonly right: T
  readonly bottom: T
  readonly left: T
}

/**
 * 台紙の型番。日本で入手しやすい A4 ラベルに合わせてある。
 * `<用紙>-<面数>-<セル寸法>` の形で、値そのものが型番として読める
 * （docs/domain-model.md の `LabelSheetId` の例に従う）。
 */
export type LabelSheetId = 'a4-24-70x33.9' | 'a4-12-86.4x42.3' | 'a4-65-38.1x21.2' | 'a4-1-210x297'

/** 台紙 1 種類の物理寸法。面付けアルゴリズムはこの値だけを読む。 */
export type LabelSheet = {
  readonly id: LabelSheetId
  /** 用紙サイズ。 */
  readonly page: { readonly width: Millimeter; readonly height: Millimeter }
  /** 用紙の縁からセル領域までの余白。 */
  readonly margin: Edges<Millimeter>
  /** ラベル 1 枚（セル 1 つ）の寸法。 */
  readonly cell: { readonly width: Millimeter; readonly height: Millimeter }
  /** セルとセルの間隔。 */
  readonly gap: { readonly x: Millimeter; readonly y: Millimeter }
  readonly columns: number
  readonly rows: number
}

/** 型番から、その台紙の型を取り出す。レジストリの Mapped Type で使う。 */
export type LabelSheetOf<K extends LabelSheetId> = LabelSheet & { readonly id: K }

type LabelSheetMeta = {
  /** `<select>` に出る名前。面数と寸法を含め、単体で台紙を選べるようにする。 */
  readonly label: string
  /** どんな用途に向くか。台紙を持っていない人にも選べるように書く。 */
  readonly description: string
  /** 印刷前に気をつけること。空文字にはしない（AAA 3.3.5）。 */
  readonly caution: string
}

/**
 * 台紙ごとの説明。**Mapped Type なので、`LabelSheetId` に型番を足して
 * ここに 1 行足し忘れるとコンパイルエラーになる。**
 * 寸法側（`features/print/core/sheets/`）のレジストリも同じ形なので、
 * 「型番だけ増えて実体がない」状態は型が許さない。
 */
export const LABEL_SHEET_META: { readonly [K in LabelSheetId]: LabelSheetMeta } = {
  'a4-24-70x33.9': {
    label: 'A4 24 面（70 × 33.9mm・3 列 8 行）',
    description:
      '市販のラベル台紙でもっともよく使われる大きさです。QR コードとその下に短い名前がちょうど収まります。',
    caution: '左右に余白がない台紙です。印刷ダイアログで「余白なし」を選んでください。',
  },
  'a4-12-86.4x42.3': {
    label: 'A4 12 面（86.4 × 42.3mm・2 列 6 行）',
    description:
      '名刺に近い大きさで、QR コードと説明文を並べて置けます。棚や備品の表示に向きます。',
    caution: '列の間に 4.6mm の隙間があります。カットせずそのまま貼れます。',
  },
  'a4-65-38.1x21.2': {
    label: 'A4 65 面（38.1 × 21.2mm・5 列 13 行）',
    description:
      '小さめの管理ラベルです。1 枚に 65 個入るので、同じコードをたくさん刷るときに向きます。',
    caution: 'セルが小さいので、キャプションを付けると QR コードが読み取りにくくなります。',
  },
  'a4-1-210x297': {
    label: 'A4 全面 1 面（210 × 297mm・ノーカット）',
    description:
      '切れ目のない 1 枚ものの台紙です。大きなコードを 1 つだけ刷るときや、試し刷りに使います。',
    caution:
      '用紙の端まで印刷できるプリンタは多くありません。縁が切れる場合は 1 段小さい台紙を選んでください。',
  },
}

/** `<select>` の並び順。定義順がそのまま面数の多い順・使う頻度順になっている。 */
export const LABEL_SHEET_IDS: readonly LabelSheetId[] = Object.keys(LABEL_SHEET_META).filter(
  (key): key is LabelSheetId => key in LABEL_SHEET_META,
)

export const isLabelSheetId = (value: string): value is LabelSheetId => value in LABEL_SHEET_META

/**
 * `<select>` の値やクエリ文字列から型番を作る唯一の入口。
 * `as` を書かずに済ませるために、生成点をここ 1 つに絞る。
 */
export const parseLabelSheetId = (
  value: string,
): Result<LabelSheetId, { readonly kind: 'unknown_sheet'; readonly received: string }> =>
  isLabelSheetId(value) ? ok(value) : err({ kind: 'unknown_sheet', received: value })
