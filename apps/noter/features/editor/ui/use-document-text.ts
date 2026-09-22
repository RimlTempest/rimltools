/**
 * 本文（`Y.Text`）を React の値として読む。
 *
 * 解析・診断・プレビューはすべてこの文字列から作る。**打鍵のたびに読むと
 * 重い**ので、入力が落ち着いてから読み直す（`docs/design/ux.md` §4.2）。
 * ここが唯一の読み取り口なので、画面の各所が別々に `observe` しない。
 */
import { useEffect, useState } from 'react'
import type * as Y from 'yjs'
import type { TimerPort } from '../core/debounce.ts'
import { debounce } from '../core/debounce.ts'

/** 入力が止まったとみなすまでの時間。 */
export const TEXT_DEBOUNCE_MS = 150

const browserTimer: TimerPort<ReturnType<typeof setTimeout>> = {
  setTimer: (run, delayMs) => setTimeout(run, delayMs),
  clearTimer: (handle) => {
    clearTimeout(handle)
  },
}

export const useDocumentText = (ytext: Y.Text, delayMs: number = TEXT_DEBOUNCE_MS): string => {
  const [text, setText] = useState(() => ytext.toJSON())

  useEffect(() => {
    const debounced = debounce(browserTimer, delayMs, () => setText(ytext.toJSON()))
    const observer = (): void => debounced.call()
    ytext.observe(observer)
    // 監視を始める前に入った変更（他の人の編集・初回同期）を取りこぼさない。
    // ここで直接読まず予約するのは、描画の途中で state を書き換えないため。
    debounced.call()

    return () => {
      debounced.cancel()
      ytext.unobserve(observer)
    }
  }, [ytext, delayMs])

  return text
}
