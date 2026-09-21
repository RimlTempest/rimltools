import { createFileRoute } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import { browserNfcWriter, canWriteNfc } from './browser-nfc.ts'
import { NfcScreen } from './nfc-screen.tsx'

const writeNfc = browserNfcWriter()

const neverChanges = () => () => {}

/**
 * NFC 書き込み画面の composition root。
 *
 * 書き込みは端末側で完結するので server function を持たない。
 * Web NFC が使えるかはハイドレーション後にしか分からないので、
 * SSR の出力と食い違わせないよう `useSyncExternalStore` で判定を遅らせる。
 */
const Nfc = () => {
  const isHydrated = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  )
  const inBrowser = isHydrated && canWriteNfc()

  return <NfcScreen writeNfc={inBrowser ? writeNfc : undefined} />
}

export const Route = createFileRoute('/nfc')({ component: Nfc })
