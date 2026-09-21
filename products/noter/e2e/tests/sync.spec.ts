import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as Y from 'yjs'

/**
 * 同時編集の結合テスト。`/ws/` は本物の認可を通る（plan 004）ので、
 * **文書を作り、共有リンクで相手を参加させてから**繋ぐ。
 *
 * plan 005 でエディタが載るまではエディタ画面が無いので、ここでは生の
 * WebSocket をブラウザのコンテキスト（= セッション Cookie 付き）で開き、
 * ワイヤ形式のまま検証する。
 */

const MESSAGE_SYNC = 0
const SYNC_STEP1 = 0
const SYNC_UPDATE = 2

const documentIdOf = (url: string): string => new URL(url).pathname.replace('/d/', '')

const createDocument = async (page: Page): Promise<string> => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Markdown で始める' }).click()
  await expect(page).toHaveURL(/\/d\/doc_[0-9a-z]{24}$/)
  return page.url()
}

/**
 * 共有ダイアログを開く。
 *
 * `showModal()` はハイドレーション後にしか動かないので、押しても開かない
 * ことがある（SSR 直後の 1 瞬）。開くまで押し直す — `waitForTimeout` で
 * 「たぶん終わったころ」を待つより、実際の状態を待つほうが安定する。
 */
const openShareDialog = async (page: Page): Promise<void> => {
  await expect(async () => {
    await page.getByRole('button', { name: '共有' }).click()
    await expect(page.getByRole('radio', { name: '閲覧のみ' })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20_000 })
}

const createShareLink = async (page: Page): Promise<string> => {
  await openShareDialog(page)
  await page.getByRole('button', { name: 'リンクを作成' }).click()
  const link = page.getByRole('list', { name: '有効なリンク' }).locator('code').first()
  await expect(link).toBeVisible()
  return (await link.textContent()) ?? ''
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

test('メンバーが接続すると sync step1 が届く', async ({ page }) => {
  const documentUrl = await createDocument(page)
  const frame = await firstFrame(page, `/ws/${documentIdOf(documentUrl)}`, null)
  expect(frame[0]).toBe(MESSAGE_SYNC)
  expect(frame[1]).toBe(SYNC_STEP1)
})

test('セッションが無いと接続できない', async ({ browser, page }) => {
  const documentUrl = await createDocument(page)
  const documentId = documentIdOf(documentUrl)

  const stranger = await browser.newContext()
  try {
    const outsider = await stranger.newPage()
    await outsider.goto('/')
    // 非メンバーは 404 で拒否され、ソケットは開かないまま閉じる
    await expect(firstFrame(outsider, `/ws/${documentId}`, null)).rejects.toThrow()
  } finally {
    await stranger.close()
  }
})

test('共有リンクで参加した人に更新が届く', async ({ browser, page }) => {
  const documentUrl = await createDocument(page)
  const shareUrl = await createShareLink(page)
  const path = `/ws/${documentIdOf(documentUrl)}`

  const joined = await browser.newContext()
  try {
    const receiver = await joined.newPage()
    await receiver.goto(shareUrl)
    await expect(receiver).toHaveURL(/\/d\/doc_[0-9a-z]{24}$/)

    const receiving = firstFrame(receiver, path, SYNC_UPDATE)
    void sendRepeatedly(page, path, syncUpdateMessage('hello from e2e')).catch(() => undefined)

    expect(textOfUpdateFrame(await receiving)).toBe('hello from e2e')
  } finally {
    await joined.close()
  }
})
