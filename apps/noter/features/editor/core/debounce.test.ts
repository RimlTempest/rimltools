import { describe, expect, test } from 'bun:test'
import { debounce } from './debounce.ts'

/** 偽の時計。予約された処理を溜めておき、`fire` で好きなときに進める。 */
const fakeTimer = () => {
  const scheduled = new Map<number, () => void>()
  const delays: number[] = []
  let issued = 0
  return {
    scheduled,
    delays,
    port: {
      setTimer: (run: () => void, delayMs: number): number => {
        issued += 1
        scheduled.set(issued, run)
        delays.push(delayMs)
        return issued
      },
      clearTimer: (handle: number): void => {
        scheduled.delete(handle)
      },
    },
    fire: (): void => {
      const pending = [...scheduled.values()]
      scheduled.clear()
      for (const run of pending) run()
    },
  }
}

describe('debounce', () => {
  test('待ち時間が過ぎるまで呼ばない', () => {
    const timer = fakeTimer()
    let calls = 0
    const debounced = debounce(timer.port, 150, () => {
      calls += 1
    })

    debounced.call()
    expect(calls).toBe(0)

    timer.fire()
    expect(calls).toBe(1)
  })

  test('続けて呼ばれても最後の 1 回だけ実行する', () => {
    const timer = fakeTimer()
    let calls = 0
    const debounced = debounce(timer.port, 150, () => {
      calls += 1
    })

    debounced.call()
    debounced.call()
    debounced.call()
    expect(timer.scheduled.size).toBe(1)

    timer.fire()
    expect(calls).toBe(1)
  })

  test('cancel すると実行しない', () => {
    const timer = fakeTimer()
    let calls = 0
    const debounced = debounce(timer.port, 150, () => {
      calls += 1
    })

    debounced.call()
    debounced.cancel()
    timer.fire()
    expect(calls).toBe(0)
  })

  test('実行したあとにもう一度呼べる', () => {
    const timer = fakeTimer()
    let calls = 0
    const debounced = debounce(timer.port, 150, () => {
      calls += 1
    })

    debounced.call()
    timer.fire()
    debounced.call()
    timer.fire()
    expect(calls).toBe(2)
  })

  test('渡した待ち時間をそのまま時計に伝える', () => {
    const timer = fakeTimer()
    debounce(timer.port, 150, () => {}).call()
    expect(timer.delays).toEqual([150])
  })
})
