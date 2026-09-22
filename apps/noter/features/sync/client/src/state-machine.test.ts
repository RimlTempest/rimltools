import type { ConnectionState } from '@noter/sync/contract'
import { describe, expect, test } from 'bun:test'
import { INITIAL_STATE, nextState } from './state-machine.ts'

const connected: ConnectionState = { kind: 'connected' }
const rejected: ConnectionState = { kind: 'rejected', reason: 'forbidden' }
const offline: ConnectionState = { kind: 'offline' }

describe('nextState', () => {
  test('最初は connecting', () => {
    expect(INITIAL_STATE).toEqual({ kind: 'connecting' })
  })

  test('connecting → connected', () => {
    expect(nextState(INITIAL_STATE, { kind: 'connected' })).toEqual({ kind: 'connected' })
  })

  test('connected → 切断で reconnecting(1)', () => {
    expect(nextState(connected, { kind: 'disconnected' })).toEqual({
      kind: 'reconnecting',
      attempt: 1,
    })
  })

  test('切断が続くと試行回数が増える', () => {
    const first = nextState(connected, { kind: 'disconnected' })
    const second = nextState(first, { kind: 'disconnected' })
    expect(second).toEqual({ kind: 'reconnecting', attempt: 2 })
  })

  test('reconnecting 中の connecting は試行回数を保つ', () => {
    const first = nextState(connected, { kind: 'disconnected' })
    expect(nextState(first, { kind: 'connecting' })).toEqual({ kind: 'reconnecting', attempt: 1 })
  })

  test('reconnecting → connected で回復する', () => {
    const first = nextState(connected, { kind: 'disconnected' })
    expect(nextState(first, { kind: 'connected' })).toEqual({ kind: 'connected' })
  })

  test('4xxx の close は rejected になる', () => {
    expect(nextState(connected, { kind: 'rejected', reason: 'not_found' })).toEqual({
      kind: 'rejected',
      reason: 'not_found',
    })
  })

  test('rejected は切断・再接続・オフラインでは動かない', () => {
    expect(nextState(rejected, { kind: 'disconnected' })).toEqual(rejected)
    expect(nextState(rejected, { kind: 'connecting' })).toEqual(rejected)
    expect(nextState(rejected, { kind: 'offline' })).toEqual(rejected)
    expect(nextState(rejected, { kind: 'online' })).toEqual(rejected)
  })

  test('rejected でも別の理由の rejected は上書きする', () => {
    expect(nextState(rejected, { kind: 'rejected', reason: 'limit' })).toEqual({
      kind: 'rejected',
      reason: 'limit',
    })
  })

  test('オフラインになると offline、戻ると reconnecting(1)', () => {
    expect(nextState(connected, { kind: 'offline' })).toEqual(offline)
    expect(nextState(offline, { kind: 'online' })).toEqual({ kind: 'reconnecting', attempt: 1 })
  })

  test('offline 中の切断は offline のまま', () => {
    expect(nextState(offline, { kind: 'disconnected' })).toEqual(offline)
  })

  test('オンラインのままの online は何も変えない', () => {
    expect(nextState(connected, { kind: 'online' })).toEqual(connected)
  })
})
