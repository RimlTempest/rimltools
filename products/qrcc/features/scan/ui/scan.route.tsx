import { createFileRoute } from '@tanstack/react-router'
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
 * 読み取り画面の配線。
 *
 * 読み取りは端末側で完結するので server function を持たない。
 * カメラ・クリップボードが使えるかはハイドレーション後にしか分からないので、
 * SSR の出力と食い違わせないよう `useSyncExternalStore` で判定を遅らせる。
 */
const Scan = () => {
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
    />
  )
}

export const Route = createFileRoute('/scan')({ component: Scan })
