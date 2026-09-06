/**
 * `/ws/:documentId` の疎通確認。
 *
 * ブラウザを立ち上げずに「Upgrade が通り、DO が sync step1 に step2 で返す」
 * ところまでを確かめる。plan 002 のスパイクで一番壊れやすい経路
 * （auxiliary Worker 間の DO binding と Hibernation API）がここに出る。
 *
 *   bun run dev            # 別のシェルで
 *   bun run scripts/ws-probe.ts 'ws://localhost:5173/ws/doc_…' 'better-auth.session_token=…'
 *
 * `/ws/` は本物の認可を通る（plan 004）。第 2 引数にメンバーのセッション Cookie を
 * 渡さないと 401 で切られる。Cookie はブラウザの開発者ツールから取る。
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as Y from 'yjs'

const DEFAULT_URL = 'ws://localhost:5173/ws/doc_000000000000000000000000'
const TIMEOUT_MS = 10_000
const MESSAGE_SYNC = 0
const SYNC_STEP1 = 0
const SYNC_STEP2 = 1

const target = new URL(process.argv[2] ?? DEFAULT_URL)

/**
 * `/ws/` は本物の認可を通る（plan 004）。ブラウザ以外から繋ぐには
 * メンバーのセッション Cookie が要る。無いと 401 で切られる。
 */
const cookie = process.argv[3] ?? process.env['NOTER_SESSION_COOKIE'] ?? ''

const doc = new Y.Doc()

const syncStep1 = (): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  encoding.writeVarUint(encoder, SYNC_STEP1)
  encoding.writeVarUint8Array(encoder, Y.encodeStateVector(doc))
  return encoding.toUint8Array(encoder)
}

const fail = (reason: string): never => {
  console.error(reason)
  process.exit(1)
}

const timer = setTimeout(() => fail(`timeout after ${TIMEOUT_MS}ms`), TIMEOUT_MS)

const socket = new WebSocket(target.toString(), cookie === '' ? {} : { headers: { cookie } })
socket.binaryType = 'arraybuffer'

socket.addEventListener('open', () => {
  console.log('open')
  socket.send(syncStep1())
})

socket.addEventListener('message', (event: MessageEvent) => {
  const data: unknown = event.data
  if (!(data instanceof ArrayBuffer)) {
    console.log(`ignored a non-binary frame: ${String(data)}`)
    return
  }
  const decoder = decoding.createDecoder(new Uint8Array(data))
  const type = decoding.readVarUint(decoder)
  if (type !== MESSAGE_SYNC) return
  const subtype = decoding.readVarUint(decoder)
  if (subtype !== SYNC_STEP2) return

  Y.applyUpdate(doc, decoding.readVarUint8Array(decoder))
  console.log('sync step2 received')
  clearTimeout(timer)
  socket.close(1000, 'done')
  process.exit(0)
})

socket.addEventListener('error', () => fail('websocket error'))

socket.addEventListener('close', (event: CloseEvent) => {
  fail(`closed before step2: code=${event.code} reason=${event.reason}`)
})
