/**
 * 編集フォームの状態と、保存できる形への変換（純粋）。
 *
 * 画面で編集するのは名前・フォルダ・内容・種類・色・大きさだけ。
 * それ以外（静寂域・バー高さ・数字表示・Wi-Fi の設定など）は**開いて保存する
 * だけで失わない**ように、元の値をそのまま持ち回る。
 * 「編集画面を開いたら設定が初期化された」が一番困る。
 */
import type { CodeId, FolderId, Result } from '@qrcc/contract'
import { err, ok, parseHexColor, parseHttpUrl, parseNonEmptyText } from '@qrcc/contract'
import type {
  CodePayload,
  QrErrorCorrection,
  RenderStyle,
  Symbology,
  SymbologyKind,
} from '@qrcc/generate/contract'
import type { CodeDraft, SavedCode } from '@qrcc/manage/contract'

/**
 * 画面で扱う「内容」。
 *
 * テキストと URL は編集できる。それ以外は**そのまま保つ**だけで、
 * 中身は生成画面（/generate）で作り直してもらう。
 * optional の寄せ集めにせず union にすることで、
 * 「編集できない内容を編集しようとする」経路が型で消える。
 */
export type CodeContent =
  | { readonly kind: 'text'; readonly text: string }
  /** 未検証の入力。保存時に `parseHttpUrl` を通す。 */
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'other'; readonly payload: CodePayload }

export type CodeFormState = {
  readonly name: string
  readonly folderId: FolderId | undefined
  readonly content: CodeContent
  readonly symbologyKind: SymbologyKind
  readonly qrEc: QrErrorCorrection
  readonly foreground: string
  readonly background: string
  readonly scale: number
  /** 画面に出さない見た目の設定。往復で失わないために持ち回る。 */
  readonly baseStyle: RenderStyle | undefined
}

export type CodeFormError = {
  /** 画面のラベルと同じ文言。どの入力を直せばよいかを指す。 */
  readonly field: string
  readonly reason: string
}

const DEFAULT_BAR_HEIGHT = 40

export const NEW_CODE_FORM: CodeFormState = {
  name: '',
  folderId: undefined,
  content: { kind: 'url', url: 'https://qrcc.riml4i.com' },
  symbologyKind: 'qr',
  qrEc: 'M',
  foreground: '#000000',
  background: '#ffffff',
  scale: 6,
  baseStyle: undefined,
}

const buildPayload = (content: CodeContent): Result<CodePayload, CodeFormError> => {
  switch (content.kind) {
    case 'text': {
      return content.text.length === 0
        ? err({ field: '内容', reason: '文字を入力してください' })
        : ok({ kind: 'text', text: content.text })
    }
    case 'url': {
      const url = parseHttpUrl(content.url)
      return url.ok
        ? ok({ kind: 'url', url: url.value })
        : err({
            field: 'リンク先の URL',
            reason: 'http:// か https:// で始まる URL を入力してください',
          })
    }
    case 'other':
      return ok(content.payload)
  }
}

const buildSymbology = (state: CodeFormState): Symbology => {
  switch (state.symbologyKind) {
    case 'qr':
      return { kind: 'qr', ec: state.qrEc }
    case 'code128':
      return { kind: 'code128', charset: 'auto' }
    case 'ean13':
      return { kind: 'ean13' }
  }
}

export const buildCodeDraft = (
  id: CodeId,
  state: CodeFormState,
): Result<CodeDraft, CodeFormError> => {
  // 前後の空白は名前の一部として扱わない（一覧で見分けが付かなくなる）。
  // qrcc-api 側も同じように詰めるので、保存前後で名前が変わらない。
  const name = parseNonEmptyText(state.name.trim())
  if (!name.ok) return err({ field: '名前', reason: '名前を入力してください' })

  const payload = buildPayload(state.content)
  if (!payload.ok) return payload

  const foreground = parseHexColor(state.foreground)
  const background = parseHexColor(state.background)
  if (!foreground.ok || !background.ok) {
    return err({ field: '色', reason: '色の指定が不正です' })
  }

  const style: RenderStyle = {
    foreground: foreground.value,
    background: { kind: 'solid', color: background.value },
    scale: state.scale,
    quiet_zone: state.baseStyle?.quiet_zone ?? null,
    module_shape: state.baseStyle?.module_shape ?? 'square',
    bar_height: state.baseStyle?.bar_height ?? DEFAULT_BAR_HEIGHT,
    human_readable: state.baseStyle?.human_readable ?? true,
  }

  return ok({
    id,
    name: name.value,
    folderId: state.folderId,
    payload: payload.value,
    symbology: buildSymbology(state),
    style,
  })
}

export const toCodeContent = (payload: CodePayload): CodeContent => {
  switch (payload.kind) {
    case 'text':
      return { kind: 'text', text: payload.text }
    case 'url':
      return { kind: 'url', url: payload.url }
    case 'wifi':
      return { kind: 'other', payload }
  }
}

/** 保存されたコードを編集フォームの初期値に開く。 */
export const toCodeForm = (code: SavedCode): CodeFormState => ({
  name: code.name,
  folderId: code.folderId,
  content: toCodeContent(code.payload),
  symbologyKind: code.symbology.kind,
  qrEc: code.symbology.kind === 'qr' ? code.symbology.ec : 'M',
  foreground: code.style.foreground,
  background: code.style.background.kind === 'solid' ? code.style.background.color : '#ffffff',
  scale: code.style.scale,
  baseStyle: code.style,
})

/**
 * 削除を取り消すための下書き。**同じ id で作り直す**ので、
 * 発行済みの共有リンクの URL も、ブックマークした編集画面の URL も変わらない。
 */
export const toRestoreDraft = (code: SavedCode): CodeDraft => ({
  id: code.id,
  name: code.name,
  folderId: code.folderId,
  payload: code.payload,
  symbology: code.symbology,
  style: code.style,
})
