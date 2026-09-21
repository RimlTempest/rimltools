import { describe, expect, test } from 'bun:test'
import type { Detection } from '../contract/index.ts'
import { HISTORY_LIMIT, recordDetection } from './history.ts'

const found = (text: string, symbology: Detection['symbology'] = 'qr'): Detection => ({
  text,
  symbology,
  corners: [],
})

describe('読み取り履歴', () => {
  test('最初の検出は履歴に載り、読み上げる', () => {
    const recorded = recordDetection([], found('A'))
    expect(recorded.history.map((d) => d.text)).toEqual(['A'])
    expect(recorded.announce).toBe(true)
  })

  test('新しいものが先頭に来る', () => {
    const first = recordDetection([], found('A'))
    const second = recordDetection(first.history, found('B'))
    expect(second.history.map((d) => d.text)).toEqual(['B', 'A'])
  })

  /** カメラは同じコードを毎秒何度も見る。そのたびに読み上げると使い物にならない。 */
  test('直前と同じ値が続いても読み上げず、履歴も増やさない', () => {
    const first = recordDetection([], found('A'))
    const again = recordDetection(first.history, found('A'))
    expect(again.announce).toBe(false)
    expect(again.history.map((d) => d.text)).toEqual(['A'])
  })

  test('同じ文字列でも体系が違えば別の検出として扱う', () => {
    const first = recordDetection([], found('12345678'))
    const other = recordDetection(first.history, found('12345678', 'code128'))
    expect(other.announce).toBe(true)
    expect(other.history).toHaveLength(2)
  })

  /** 一度離れてから戻ってきたときは、読み取れたことを伝える必要がある。 */
  test('間に別の値を挟めば、同じ値でもまた読み上げる', () => {
    const a = recordDetection([], found('A'))
    const b = recordDetection(a.history, found('B'))
    const again = recordDetection(b.history, found('A'))
    expect(again.announce).toBe(true)
    expect(again.history.map((d) => d.text)).toEqual(['A', 'B', 'A'])
  })

  test('履歴は上限で打ち切る（カメラを向けっぱなしでも増え続けない）', () => {
    let history: readonly Detection[] = []
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      history = recordDetection(history, found(`code-${index}`)).history
    }
    expect(history).toHaveLength(HISTORY_LIMIT)
    expect(history[0]?.text).toBe(`code-${HISTORY_LIMIT + 4}`)
  })

  test('渡された履歴を書き換えない', () => {
    const original = recordDetection([], found('A')).history
    recordDetection(original, found('B'))
    expect(original.map((d) => d.text)).toEqual(['A'])
  })
})
