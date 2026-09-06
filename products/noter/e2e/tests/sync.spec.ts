import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as Y from 'yjs'

/**
 * 2 つのブラウザコンテキストを繋いで、片方の更新がもう片方に届くことを確かめる。
 *
 * plan 002 の時点では `/d/:id` の画面もエディタも無いので、生の WebSocket を
 * 開いてワイヤ形式のまま検証する。plan 005 が本物の画面越しのテストに置き換える。
 * 認可は `NOTER_DEV_OPEN_WS`（playwright.config.ts の webServer.env）で開けている。
 */

const MESSAGE_SYNC = 0
const SYNC_STEP1 = 0
const SYNC_UPDATE = 2
const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz'

/** DO の状態は文書 ID ごとに残るので、実行ごとに新しい部屋を使う。 */
const newDocumentId = (): string => {
  const body = Array.from(
    { length: 24 },
    () => CROCKFORD[Math.floor(Math.random() * CROCKFORD.length)],
  ).join('')
  return `doc_${body}`
}

const syncUpdateMessage = (text: string): number[] => {
  const source = new Y.Doc()
  source.getText('content').insert(0, text)
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  encoding.writeVarUint(encoder, SYNC_UPDATE)
  encoding.writeVarUint8Array(encoder, Y.encodeStateAsUpdate(source))
  return Array.from(encoding.toUint8Array(encoder))
}

const textOfUpdateFrame = (frame: readonly number[]): string => {
  const decoder = decoding.createDecoder(Uint8Array.from(frame))
  decoding.readVarUint(decoder)
  decoding.readVarUint(decoder)
  const target = new Y.Doc()
  Y.applyUpdate(target, decoding.readVarUint8Array(decoder))
  return target.getText('content').toJSON()
}

/**
 * ソケットを開き、条件に合う最初のバイナリフレームを返す。
 *
 * ソケットは `evaluate` のクロージャに閉じ込める。`window` に置いて別の
 * `evaluate` から読み戻すより、こちらのほうが型の逃げ道が要らない。
 */
const firstFrame = (page: Page, path: string, wantSubtype: number | null): Promise<number[]> =>
  page.evaluate(
    (input: { path: string; wantSubtype: number | null }) =>
      new Promise<number[]>((resolve, reject) => {
        const url = new URL(input.path, location.href)
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        const socket = new WebSocket(url.toString())
        socket.binaryType = 'arraybuffer'

        const timer = setTimeout(() => reject(new Error('no matching frame within 20s')), 20_000)
        const settle = (finish: () => void) => {
          clearTimeout(timer)
          finish()
        }

        socket.addEventListener('message', (event) => {
          if (!(event.data instanceof ArrayBuffer)) return
          const bytes = [...new Uint8Array(event.data)]
          if (input.wantSubtype !== null && bytes[1] !== input.wantSubtype) return
          settle(() => {
            socket.close(1000, 'done')
            resolve(bytes)
          })
        })
        socket.addEventListener('close', (event) =>
          settle(() => reject(new Error(`closed before a matching frame: ${event.code}`))),
        )
        socket.addEventListener('error', () => settle(() => reject(new Error('websocket error'))))
      }),
    { path, wantSubtype },
  )

/**
 * 受け手が繋がるより先に送ってしまう競合を避けるため、同じ更新を繰り返し送る。
 * CRDT の更新は何度適用しても同じ結果になる。
 */
const sendRepeatedly = (page: Page, path: string, message: number[]): Promise<void> =>
  page.evaluate(
    (input: { path: string; message: number[] }) =>
      new Promise<void>((resolve, reject) => {
        const url = new URL(input.path, location.href)
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        const socket = new WebSocket(url.toString())
        socket.binaryType = 'arraybuffer'

        socket.addEventListener('error', () => reject(new Error('websocket error')))
        socket.addEventListener('open', () => {
          let sent = 0
          const timer = setInterval(() => {
            sent += 1
            if (sent > 40 || socket.readyState !== WebSocket.OPEN) {
              clearInterval(timer)
              resolve()
              return
            }
            socket.send(Uint8Array.from(input.message))
          }, 250)
        })
      }),
    { path, message },
  )

test('接続すると sync step1 が届く', async ({ page, baseURL }) => {
  await page.goto(baseURL ?? '/')
  const frame = await firstFrame(page, `/ws/${newDocumentId()}?name=e2e`, null)
  expect(frame[0]).toBe(MESSAGE_SYNC)
  expect(frame[1]).toBe(SYNC_STEP1)
})

test('別のコンテキストで送った更新がもう一方に届く', async ({ browser, baseURL }) => {
  const path = `/ws/${newDocumentId()}?name=e2e`
  const [senderContext, receiverContext] = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ])

  try {
    const [sender, receiver] = await Promise.all([
      senderContext.newPage(),
      receiverContext.newPage(),
    ])
    await Promise.all([sender.goto(baseURL ?? '/'), receiver.goto(baseURL ?? '/')])

    const receiving = firstFrame(receiver, path, SYNC_UPDATE)
    void sendRepeatedly(sender, path, syncUpdateMessage('hello from e2e')).catch(() => undefined)

    expect(textOfUpdateFrame(await receiving)).toBe('hello from e2e')
  } finally {
    await Promise.all([senderContext.close(), receiverContext.close()])
  }
})
