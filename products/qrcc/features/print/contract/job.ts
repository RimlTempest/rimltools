/**
 * 面付け設定と印刷ジョブ。
 *
 * 「どのコードを、どの台紙の、何番目のセルから、何枚刷るか」を表す。
 * 面付けの計算そのものは `features/print/core/imposition.ts`。
 */
import type { LabelSheet } from './sheet.ts'

/**
 * ラベルに刷る 1 件。
 *
 * 保存済みのコード（`features/manage`）が入る前でも使えるよう、
 * ここでは ID を持たず「名前」と「内容」だけを持つ。
 */
export type PrintItem = {
  /** キャプションに出す名前。空でもよい（そのときは内容を出す）。 */
  readonly name: string
  /** コードにエンコードする内容。 */
  readonly content: string
  /** 同じコードを何枚刷るか。1 以上。 */
  readonly copies: number
}

/**
 * ラベルの下に出す文字。
 *
 * `showCaption: boolean` と `captionSource` に分けると
 * 「出さないのに custom の文字がある」状態を表現できてしまうので、
 * 「出さない」も 1 つのメンバーとして持つ
 * （docs/domain-model.md の `PrintPreset` を union に畳んだ形）。
 */
export type Caption =
  | { readonly kind: 'none' }
  | { readonly kind: 'name' }
  | { readonly kind: 'content' }
  | { readonly kind: 'custom'; readonly text: string }

export type CaptionKind = Caption['kind']

type CaptionMeta = {
  readonly label: string
  readonly description: string
}

/** `Caption` にメンバーを足すと、ここも埋めるまでコンパイルが通らない。 */
export const CAPTION_META: { readonly [K in CaptionKind]: CaptionMeta } = {
  none: {
    label: 'なし',
    description: 'コードだけを刷ります。セルが小さい台紙ではこれが読み取りやすいです。',
  },
  name: {
    label: 'コード名',
    description: '各行のタブより前に書いた名前を出します。名前がない行は内容を出します。',
  },
  content: {
    label: '内容',
    description: 'エンコードした内容そのものを出します。長い URL は途中で折り返します。',
  },
  custom: {
    label: '共通の文字',
    description: 'すべてのラベルに同じ文字を出します。備品名や部署名の表示に使います。',
  },
}

export const CAPTION_KINDS: readonly CaptionKind[] = Object.keys(CAPTION_META).filter(
  (key): key is CaptionKind => key in CAPTION_META,
)

/** 印刷ジョブ。画面の入力がそのままこの形になる。 */
export type PrintJob = {
  readonly sheet: LabelSheet
  readonly items: readonly PrintItem[]
  /**
   * 何番目のセルから刷り始めるか（1 始まり）。
   * **使いかけの台紙を無駄にしないための指定**で、印刷の実用度を決める。
   */
  readonly startCell: number
  readonly caption: Caption
}

/** 面付けに要る分だけ。キャプションは配置に影響しないので落とす。 */
export type ImpositionRequest = Omit<PrintJob, 'caption'>

/**
 * 面付け後のセル 1 つ。空きセルも「空き」として返す。
 *
 * 空きを省いて詰めてしまうと、CSS 側で開始位置ぶんの座標計算が必要になる。
 * 空きも含めて順に並べれば、Grid の自動配置だけで面付けが決まる
 * （`.claude/skills/qrcc-html-a11y` の「JS で座標計算しない」）。
 */
export type ImposedCell =
  | {
      readonly kind: 'blank'
      readonly index: number
      readonly row: number
      readonly column: number
    }
  | {
      readonly kind: 'label'
      readonly index: number
      readonly row: number
      readonly column: number
      readonly item: PrintItem
      /** 同じコードの何枚目か（1 始まり）。読み上げ用の位置説明に使う。 */
      readonly copy: number
    }

/** 台紙 1 枚ぶん。 */
export type ImposedPage = {
  /** 1 始まり。 */
  readonly pageNumber: number
  /** 台紙の全セル。埋まっているものと空きの両方が、左上から順に並ぶ。 */
  readonly cells: readonly ImposedCell[]
  /** このページで実際に刷るラベルの枚数。 */
  readonly usedCells: number
}

export type ImpositionError =
  | {
      readonly kind: 'start_cell_out_of_range'
      readonly startCell: number
      readonly cellsPerSheet: number
    }
  | { readonly kind: 'invalid_copies'; readonly name: string; readonly copies: number }
  | { readonly kind: 'too_many_labels'; readonly requested: number; readonly maximum: number }

/** 画面に出す文言。何が起きたかと、次にどうすればよいかまで書く。 */
export const describeImpositionError = (error: ImpositionError): string => {
  switch (error.kind) {
    case 'start_cell_out_of_range':
      return `開始セルは 1 から ${error.cellsPerSheet} までの数字で指定してください（いまは ${error.startCell}）。`
    case 'invalid_copies':
      return `「${error.name}」の枚数が不正です（${error.copies}）。1 以上の整数を入れてください。`
    case 'too_many_labels':
      return `ラベルが多すぎます（${error.requested} 枚）。一度に印刷できるのは ${error.maximum} 枚までです。枚数を減らすか、何回かに分けてください。`
  }
}
