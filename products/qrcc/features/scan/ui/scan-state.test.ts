import { describe, expect, test } from 'bun:test'
import type { Detection } from '../contract/index.ts'
import { INITIAL_SCAN_STATE, reduceScan } from './scan-state.ts'

const found = (text: string, symbology: Detection['symbology'] = 'qr'): Detection => ({
  text,
  symbology,
  corners: [],
})

const after = (...events: Parameters<typeof reduceScan>[1][]) =>
  events.reduce(reduceScan, INITIAL_SCAN_STATE)

describe('読み取り画面の状態', () => {
  test('最初は何も読み上げず、カメラも止まっている', () => {
    expect(INITIAL_SCAN_STATE.camera).toBe('off')
    expect(INITIAL_SCAN_STATE.message).toBeUndefined()
    expect(INITIAL_SCAN_STATE.history).toEqual([])
  })

  test('カメラの起動から停止までを読み上げる', () => {
    const starting = after({ kind: 'camera_requested' })
    expect(starting.camera).toBe('starting')
    expect(starting.message).toContain('起動')

    const running = reduceScan(starting, { kind: 'camera_started' })
    expect(running.camera).toBe('on')
    expect(running.message).toContain('読み取っています')

    const stopped = reduceScan(running, { kind: 'camera_stopped' })
    expect(stopped.camera).toBe('off')
    expect(stopped.message).toContain('停止')
  })

  test('カメラの起動に失敗したら止まった状態に戻り、理由を読み上げる', () => {
    const failed = after(
      { kind: 'camera_requested' },
      { kind: 'failed', failure: { kind: 'permission_denied' } },
    )
    expect(failed.camera).toBe('off')
    expect(failed.message).toContain('画像から読み取る')
  })

  test('検出すると履歴に載り、内容と種類を読み上げる', () => {
    const state = after({ kind: 'detected', detections: [found('HELLO')] })
    expect(state.history.map((d) => d.text)).toEqual(['HELLO'])
    expect(state.message).toContain('HELLO')
    expect(state.message).toContain('QR コード')
  })

  /** カメラは同じコードを毎秒何度も見る。そのたびに読み上げると使い物にならない。 */
  test('同じ値が続く間は読み上げを変えない', () => {
    const once = after({ kind: 'detected', detections: [found('SAME')] })
    const twice = reduceScan(once, { kind: 'detected', detections: [found('SAME')] })
    expect(twice.message).toBe(once.message)
    expect(twice.history).toHaveLength(1)
  })

  test('1 枚から複数見つかったらまとめて読み上げる', () => {
    const state = after({ kind: 'detected', detections: [found('A'), found('B')] })
    expect(state.history.map((d) => d.text)).toEqual(['B', 'A'])
    expect(state.message).toContain('A')
    expect(state.message).toContain('B')
  })

  /** 読み上げが数分続くと、次の操作に移れない。 */
  test('長い内容は読み上げ用に切り詰める', () => {
    const long = 'あ'.repeat(300)
    const state = after({ kind: 'detected', detections: [found(long)] })
    expect(state.message?.length ?? 0).toBeLessThan(140)
    expect(state.message).toContain('…')
    // 履歴には全文が残る
    expect(state.history[0]?.text).toBe(long)
  })

  test('画像の読み取り中であることを読み上げる', () => {
    const state = after({ kind: 'file_selected' })
    expect(state.reading).toBe(true)
    expect(state.message).toContain('画像')
  })

  test('画像の読み取りが終われば待ち状態を解く', () => {
    const done = after({ kind: 'file_selected' }, { kind: 'detected', detections: [found('X')] })
    expect(done.reading).toBe(false)

    const failed = after(
      { kind: 'file_selected' },
      { kind: 'failed', failure: { kind: 'not_found' } },
    )
    expect(failed.reading).toBe(false)
    expect(failed.message).toContain('見つかりません')
  })

  test('コピーの成否を読み上げる', () => {
    expect(after({ kind: 'copied', text: 'ABC' }).message).toContain('ABC')
    expect(after({ kind: 'copy_failed' }).message).toContain('コピーできません')
  })

  test('カメラの停止では履歴を消さない', () => {
    const state = after(
      { kind: 'detected', detections: [found('KEEP')] },
      { kind: 'camera_stopped' },
    )
    expect(state.history).toHaveLength(1)
  })
})
