/**
 * `NDEFReader` は本物のブラウザにしか無いので、ここでは偽物を
 * `window.NDEFReader` に差し込んで経路を固定する。
 * 標準の型定義に無いグローバルを直接代入すると型検査に引っかかるため、
 * `Reflect.set` / `Reflect.deleteProperty` を使う（本体側の読み出しと対にした書き方）。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { parseHttpUrl } from '@qrcc/contract'
import type { NfcRecord } from '../contract/index.ts'
import { browserNfcWriter, canWriteNfc } from './browser-nfc.ts'

afterEach(() => {
  Reflect.deleteProperty(window, 'NDEFReader')
})

const urlRecord = (): NfcRecord => {
  const parsed = parseHttpUrl('https://qrcc.riml4i.com')
  if (!parsed.ok) throw new Error('fixture url must be valid')
  return { kind: 'url', url: parsed.value }
}

type FakeWrite = (message: { readonly records: readonly unknown[] }) => Promise<void>

/** `new` で呼べる偽の `NDEFReader`。関数宣言なので `class` を使わずに構成できる。 */
const fakeReaderConstructor = (write: FakeWrite) =>
  function () {
    return { write }
  }

const install = (write: FakeWrite) => {
  Reflect.set(window, 'NDEFReader', fakeReaderConstructor(write))
}

describe('canWriteNfc', () => {
  test('NDEFReader が無ければ false', () => {
    expect(canWriteNfc()).toBe(false)
  })

  test('NDEFReader があれば true', () => {
    install(async () => {})
    expect(canWriteNfc()).toBe(true)
  })
})

describe('browserNfcWriter', () => {
  test('NDEFReader が無い環境では unsupported を返す', async () => {
    const write = browserNfcWriter()
    const outcome = await write(urlRecord())
    expect(outcome).toEqual({ ok: false, error: { kind: 'unsupported' } })
  })

  test('成功すると ok を返す', async () => {
    const calls: { readonly records: readonly unknown[] }[] = []
    install(async (message) => {
      calls.push(message)
    })

    const outcome = await browserNfcWriter()(urlRecord())
    expect(outcome).toEqual({ ok: true, value: undefined })
    expect(calls).toEqual([{ records: [{ recordType: 'url', data: 'https://qrcc.riml4i.com' }] }])
  })

  test('権限が拒否されると permission_denied を返す（例外は投げない）', async () => {
    install(async () => {
      throw new DOMException('denied', 'NotAllowedError')
    })

    const outcome = await browserNfcWriter()(urlRecord())
    expect(outcome).toEqual({ ok: false, error: { kind: 'permission_denied' } })
  })

  test('タグが無いと no_tag を返す（例外は投げない）', async () => {
    install(async () => {
      throw new DOMException('no tag in proximity', 'NetworkError')
    })

    const outcome = await browserNfcWriter()(urlRecord())
    expect(outcome).toEqual({ ok: false, error: { kind: 'no_tag' } })
  })

  test('それ以外の失敗は write_failed に詳細つきで返す（例外は投げない）', async () => {
    install(async () => {
      throw new DOMException('adapter is off', 'NotSupportedError')
    })

    const outcome = await browserNfcWriter()(urlRecord())
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('write_failed')
      expect(outcome.error.kind === 'write_failed' && outcome.error.detail).toContain(
        'NotSupportedError',
      )
    }
  })
})
