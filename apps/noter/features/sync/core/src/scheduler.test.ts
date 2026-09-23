import { PERSIST_BACKOFF_MAX_MS, PERSIST_DELAY_MS } from '@noter/sync/contract'
import { describe, expect, test } from 'bun:test'
import { makePersistScheduler } from './scheduler.ts'
import { makeFakeStorage } from './tests/fakes.ts'

const setup = (persist: () => Promise<void>) => {
  const storage = makeFakeStorage()
  let clock = 1_000
  const scheduler = makePersistScheduler({ storage, now: () => clock, persist })
  return {
    storage,
    scheduler,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

const succeeding = () => {
  let calls = 0
  return {
    persist: () => {
      calls += 1
      return Promise.resolve()
    },
    calls: () => calls,
  }
}

describe('makePersistScheduler', () => {
  test('markDirty を 2 回呼んでも alarm は 1 回しか張らない', async () => {
    const { storage, scheduler } = setup(() => Promise.resolve())
    await scheduler.markDirty()
    await scheduler.markDirty()
    expect(storage.setAlarmCalls()).toBe(1)
    expect(storage.alarmAt()).toBe(1_000 + PERSIST_DELAY_MS)
  })

  test('alarm が来たら persist を 1 回だけ呼び、dirty を落とす', async () => {
    const spy = succeeding()
    const { scheduler } = setup(spy.persist)
    await scheduler.markDirty()
    await scheduler.onAlarm()
    await scheduler.onAlarm()
    expect(spy.calls()).toBe(1)
  })

  test('dirty でなければ alarm が来ても書かない', async () => {
    const spy = succeeding()
    const { scheduler } = setup(spy.persist)
    await scheduler.onAlarm()
    expect(spy.calls()).toBe(0)
  })

  test('書き込みに失敗したら dirty のまま backoff で alarm を張り直す', async () => {
    const { storage, scheduler, advance } = setup(() =>
      Promise.reject(new Error('too many writes')),
    )
    await scheduler.markDirty()
    await scheduler.onAlarm()
    expect(storage.alarmAt()).toBe(1_000 + 1_000)

    advance(1_000)
    await scheduler.onAlarm()
    expect(storage.alarmAt()).toBe(2_000 + 2_000)
  })

  test('backoff は PERSIST_BACKOFF_MAX_MS で頭打ちになる', async () => {
    let failing = true
    const { storage, scheduler } = setup(() =>
      failing ? Promise.reject(new Error('nope')) : Promise.resolve(),
    )
    await scheduler.markDirty()
    for (let attempt = 0; attempt < 12; attempt += 1) {
      // backoff は「前回の結果」に依存するので、並列にはできない
      // oxlint-disable-next-line eslint/no-await-in-loop
      await scheduler.onAlarm()
    }
    expect(storage.alarmAt()).toBe(1_000 + PERSIST_BACKOFF_MAX_MS)
    failing = false
  })

  test('成功すると backoff がリセットされる', async () => {
    let failing = true
    const { storage, scheduler } = setup(() =>
      failing ? Promise.reject(new Error('nope')) : Promise.resolve(),
    )
    await scheduler.markDirty()
    await scheduler.onAlarm()
    await scheduler.onAlarm()
    failing = false
    await scheduler.onAlarm()

    failing = true
    await scheduler.markDirty()
    await scheduler.onAlarm()
    expect(storage.alarmAt()).toBe(1_000 + 1_000)
  })

  test('flush は alarm を待たずに即書き、成功したら dirty を落とす', async () => {
    const spy = succeeding()
    const { scheduler } = setup(spy.persist)
    await scheduler.markDirty()
    await scheduler.flush()
    expect(spy.calls()).toBe(1)
    await scheduler.onAlarm()
    expect(spy.calls()).toBe(1)
  })

  test('flush が失敗しても dirty は残る', async () => {
    let failing = true
    let calls = 0
    const { scheduler } = setup(() => {
      calls += 1
      return failing ? Promise.reject(new Error('nope')) : Promise.resolve()
    })
    await scheduler.markDirty()
    await scheduler.flush()
    failing = false
    await scheduler.onAlarm()
    expect(calls).toBe(2)
  })

  test('dirty でなければ flush は何も書かない', async () => {
    const spy = succeeding()
    const { scheduler } = setup(spy.persist)
    await scheduler.flush()
    expect(spy.calls()).toBe(0)
  })
})
