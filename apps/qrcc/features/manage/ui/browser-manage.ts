/**
 * ブラウザ側の実体（乱数・クリップボード）。
 *
 * 画面はこのモジュールを import しない。`*.route.tsx`（composition root）が
 * 組み立てて `ManageDeps` として渡すので、画面はテストで偽物を受け取れる。
 */
import type { RandomBytes } from '@qrcc/contract'

export const browserRandomBytes: RandomBytes = (byteLength) =>
  crypto.getRandomValues(new Uint8Array(byteLength))

export const canCopyText = (): boolean =>
  typeof navigator !== 'undefined' && navigator.clipboard !== undefined

/**
 * 共有リンクのコピー。失敗しても投げない。
 * 使えない環境では、画面が「表示されている URL を選んでコピーしてください」と案内する。
 */
export const browserCopyText = async (text: string): Promise<boolean> => {
  if (!canCopyText()) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
