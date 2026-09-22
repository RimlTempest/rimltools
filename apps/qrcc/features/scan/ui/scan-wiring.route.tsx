import { useSyncExternalStore } from 'react'
import { canUseBrowserWasm } from '@qrcc/wasm'
import {
  ScanScreen,
  browserCamera,
  browserCopyText,
  browserImageDecoder,
  canCopyText,
  canUseCamera,
} from './index.ts'

const decodeImageFile = browserImageDecoder()
const startCamera = browserCamera()

const neverChanges = () => () => {}

/**
 * 配線済みの読み取り画面。
 *
 * 読み取りは端末側で完結するので server function を持たない。
 * カメラ・クリップボードが使えるかはハイドレーション後にしか分からないので、
 * SSR の出力と食い違わせないよう `useSyncExternalStore` で判定を遅らせる。
 *
 * 単独のルートは持たない。トップページが生成と並べて置く
 * （`features/shell/ui/home.route.tsx`）。
 */
export const ScanSection = ({ headingLevel = 1 }: { readonly headingLevel?: 1 | 2 }) => {
  const isHydrated = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  )
  const inBrowser = isHydrated && canUseBrowserWasm()

  return (
    <ScanScreen
      startCamera={inBrowser && canUseCamera() ? startCamera : undefined}
      decodeImageFile={decodeImageFile}
      copyText={inBrowser && canCopyText() ? browserCopyText : undefined}
      headingLevel={headingLevel}
    />
  )
}
