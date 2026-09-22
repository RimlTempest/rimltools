import { MAX_WS_MESSAGE_BYTES, type Role } from '@noter/contract'
import {
  CLOSE_CODES,
  MAX_AWARENESS_BYTES,
  MESSAGE_AWARENESS,
  MESSAGE_QUERY_AWARENESS,
  MESSAGE_SYNC,
  SYNC_STEP1,
  SYNC_STEP2,
  SYNC_UPDATE,
} from '@noter/sync/contract'
import { describe, expect, test } from 'bun:test'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as Y from 'yjs'
import { toArrayBuffer } from './bytes.ts'
import { handleMessage } from './inbound.ts'
import { makeFakeSocket } from './tests/fakes.ts'
import { encodeAwarenessMessage, encodeSyncUpdate } from './wire.ts'

const encodeStep1 = (doc: Y.Doc) => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  encoding.writeVarUint(encoder, SYNC_STEP1)
  encoding.writeVarUint8Array(encoder, Y.encodeStateVector(doc))
  return encoding.toUint8Array(encoder)
}

const encodeSingleVarUint = (value: number) => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, value)
  return encoding.toUint8Array(encoder)
}

type Harness = ReturnType<typeof harness>

const harness = (role: Role) => {
  const doc = new Y.Doc()
  const socket = makeFakeSocket()
  const sentToOrigin: Uint8Array[] = []
  const broadcast: Uint8Array[] = []
  const stored: Uint8Array[] = []
  let others: readonly Uint8Array[] = []
  let dirty = 0

  const run = (message: ArrayBuffer | string) =>
    handleMessage({
      doc,
      socket,
      role,
      message,
      send: (payload) => sentToOrigin.push(payload),
      broadcast: (payload) => broadcast.push(payload),
      storeAwareness: (bytes) => stored.push(bytes),
      awarenessOfOthers: () => others,
      markDirty: () => {
        dirty += 1
      },
    })

  return {
    doc,
    socket,
    run,
    sentToOrigin,
    broadcast,
    stored,
    dirty: () => dirty,
    setOthers: (value: readonly Uint8Array[]) => {
      others = value
    },
  }
}

const updateFrom = (text: string) => {
  const source = new Y.Doc()
  source.getText('content').insert(0, text)
  return Y.encodeStateAsUpdate(source)
}

const contentOf = (harnessed: Harness) => harnessed.doc.getText('content').toJSON()

describe('handleMessage: sync', () => {
  test('step1 には step2 で返す（viewer にも返す）', () => {
    for (const role of ['owner', 'editor', 'viewer'] satisfies Role[]) {
      const scope = harness(role)
      scope.doc.getText('content').insert(0, 'hello')
      const empty = new Y.Doc()

      expect(scope.run(toArrayBuffer(encodeStep1(empty)))).toEqual({ kind: 'ok' })
      expect(scope.sentToOrigin).toHaveLength(1)

      const decoder = decoding.createDecoder(scope.sentToOrigin[0] ?? new Uint8Array())
      expect(decoding.readVarUint(decoder)).toBe(MESSAGE_SYNC)
      expect(decoding.readVarUint(decoder)).toBe(SYNC_STEP2)
      Y.applyUpdate(empty, decoding.readVarUint8Array(decoder))
      expect(empty.getText('content').toJSON()).toBe('hello')
    }
  })

  test('editor の update は doc に反映され、他へ中継され、markDirty される', () => {
    const scope = harness('editor')
    expect(scope.run(toArrayBuffer(encodeSyncUpdate(updateFrom('abc'))))).toEqual({ kind: 'ok' })
    expect(contentOf(scope)).toBe('abc')
    expect(scope.broadcast).toHaveLength(1)
    expect(scope.dirty()).toBe(1)
  })

  test('step2 も update と同じように扱う', () => {
    const scope = harness('owner')
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    encoding.writeVarUint(encoder, SYNC_STEP2)
    encoding.writeVarUint8Array(encoder, updateFrom('xyz'))

    expect(scope.run(toArrayBuffer(encoding.toUint8Array(encoder)))).toEqual({ kind: 'ok' })
    expect(contentOf(scope)).toBe('xyz')
    expect(scope.broadcast).toHaveLength(1)
  })

  test('中継されるのは種別 sync / 副種別 update のメッセージ', () => {
    const scope = harness('editor')
    scope.run(toArrayBuffer(encodeSyncUpdate(updateFrom('abc'))))
    const decoder = decoding.createDecoder(scope.broadcast[0] ?? new Uint8Array())
    expect(decoding.readVarUint(decoder)).toBe(MESSAGE_SYNC)
    expect(decoding.readVarUint(decoder)).toBe(SYNC_UPDATE)
  })

  test('viewer の update は黙って捨てる（返さない・切らない）', () => {
    const scope = harness('viewer')
    expect(scope.run(toArrayBuffer(encodeSyncUpdate(updateFrom('abc'))))).toEqual({ kind: 'ok' })
    expect(contentOf(scope)).toBe('')
    expect(scope.broadcast).toHaveLength(0)
    expect(scope.dirty()).toBe(0)
  })

  test('未知の副種別は 4400 で閉じる', () => {
    const scope = harness('editor')
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    encoding.writeVarUint(encoder, 9)
    expect(scope.run(toArrayBuffer(encoding.toUint8Array(encoder)))).toEqual({
      kind: 'close',
      code: CLOSE_CODES.badRequest,
      reason: 'bad_request',
    })
  })

  test('壊れたバイト列は 4400 で閉じる', () => {
    const scope = harness('editor')
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    encoding.writeVarUint(encoder, SYNC_UPDATE)
    encoding.writeVarUint(encoder, 200) // 実体の無い長さ
    expect(scope.run(toArrayBuffer(encoding.toUint8Array(encoder)))).toEqual({
      kind: 'close',
      code: CLOSE_CODES.badRequest,
      reason: 'bad_request',
    })
  })
})

describe('handleMessage: awareness', () => {
  test('awareness は保存され、他へ中継される', () => {
    const scope = harness('editor')
    const update = new Uint8Array([1, 2, 3])
    expect(scope.run(toArrayBuffer(encodeAwarenessMessage(update)))).toEqual({ kind: 'ok' })
    expect(scope.stored).toEqual([update])
    expect(scope.broadcast).toHaveLength(1)
  })

  test('viewer の awareness は捨てる（覗き見感を出さない）', () => {
    const scope = harness('viewer')
    expect(scope.run(toArrayBuffer(encodeAwarenessMessage(new Uint8Array([1]))))).toEqual({
      kind: 'ok',
    })
    expect(scope.stored).toHaveLength(0)
    expect(scope.broadcast).toHaveLength(0)
  })

  test('MAX_AWARENESS_BYTES 超は保存も中継もしない', () => {
    const scope = harness('editor')
    const huge = new Uint8Array(MAX_AWARENESS_BYTES + 1)
    expect(scope.run(toArrayBuffer(encodeAwarenessMessage(huge)))).toEqual({ kind: 'ok' })
    expect(scope.stored).toHaveLength(0)
    expect(scope.broadcast).toHaveLength(0)
  })

  test('queryAwareness には全員ぶんの awareness を返す', () => {
    const scope = harness('viewer')
    scope.setOthers([new Uint8Array([1]), new Uint8Array([2])])
    expect(scope.run(toArrayBuffer(encodeSingleVarUint(MESSAGE_QUERY_AWARENESS)))).toEqual({
      kind: 'ok',
    })
    expect(scope.sentToOrigin).toHaveLength(2)
    for (const payload of scope.sentToOrigin) {
      const decoder = decoding.createDecoder(payload)
      expect(decoding.readVarUint(decoder)).toBe(MESSAGE_AWARENESS)
    }
  })
})

describe('handleMessage: 拒否', () => {
  test('テキストフレームは 4400 で閉じる', () => {
    expect(harness('editor').run('hello')).toEqual({
      kind: 'close',
      code: CLOSE_CODES.badRequest,
      reason: 'bad_request',
    })
  })

  test('MAX_WS_MESSAGE_BYTES 超は 4413 で閉じる', () => {
    const huge = new ArrayBuffer(MAX_WS_MESSAGE_BYTES + 1)
    expect(harness('editor').run(huge)).toEqual({
      kind: 'close',
      code: CLOSE_CODES.tooLarge,
      reason: 'too_large',
    })
  })

  test('未知の種別（7）は 4400 で閉じる', () => {
    expect(harness('editor').run(toArrayBuffer(encodeSingleVarUint(7)))).toEqual({
      kind: 'close',
      code: CLOSE_CODES.badRequest,
      reason: 'bad_request',
    })
  })

  test('予約帯（100）も 4400 で閉じる', () => {
    expect(harness('editor').run(toArrayBuffer(encodeSingleVarUint(100)))).toEqual({
      kind: 'close',
      code: CLOSE_CODES.badRequest,
      reason: 'bad_request',
    })
  })

  test('空のメッセージは 4400 で閉じる', () => {
    expect(harness('editor').run(new ArrayBuffer(0))).toEqual({
      kind: 'close',
      code: CLOSE_CODES.badRequest,
      reason: 'bad_request',
    })
  })
})
