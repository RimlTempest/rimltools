// noter の Service Worker。
//
// 素の JavaScript（ビルドを通さない。vite.config.ts にプラグインを足さない
// ため）。typecheck も型情報つきの lint も効かないので、**ロジックを増やさない
// こと**。増やしたくなったら、ビルドに組み込む判断を改めてする。
//
// キャッシュの方針（plan 007）:
//   /ws/ /api/ /d/ /s/  … 素通し（WebSocket・認証・文書本体・共有リンクの入口）
//   ページ（HTML）      … 素通し（下記）
//   それ以外の GET      … stale-while-revalidate（/assets/ は内容ハッシュ付き）
//
// **文書の本文はキャッシュしない。** 本文は Yjs がメモリと再送で持っている。
// 古い本文を返す層を挟んでも、遅れて上書きされるだけで害しかない。
//
// **HTML もキャッシュしない。** 一覧（`/`）はサインインした人の文書名を
// 含んだ状態で配信される。共有端末でこれがキャッシュに残ると、次の人に
// 前の利用者の文書名が見えてしまう。
//
// **新しい版をその場で即有効化する呼び出しはしない。** それをすると、
// 開いているページの途中でアセットの世代が入れ替わり、古い HTML が
// 新しいチャンクを要求して壊れる。次にページを開いたときに有効になればよい。

const CACHE_NAME = 'noter-shell-v1'

// 先に持っておくアプリシェル。HTML は入れない（上記の理由）
const PRECACHE = ['/icon.svg']

// ネットワークへ直行させる path の接頭辞。
//   /ws/  … Durable Object への WebSocket。SW が触ってよいものが何もない
//   /api/ … 認証（Better Auth）
//   /d/   … 文書（画面と raw）。中身は Yjs が持つ
//   /s/   … 共有リンクの入口。トークンの解決は毎回サーバで行う
const BYPASS_PREFIXES = ['/ws/', '/api/', '/d/', '/s/']

self.addEventListener('install', (event) => {
  // ここで即時有効化（skipWaiting）はしない
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  // 自分の版以外のキャッシュを全部消す
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      ),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  // GET 以外は一切触らない
  if (request.method !== 'GET') return

  // プロトコルの切り替え（WebSocket など）には絶対に触らない。
  // /ws/ は下でも弾いているが、判定の順番に関わらず素通しさせる
  if (request.headers.has('Upgrade')) return

  const url = new URL(request.url)

  // 同一オリジンだけを扱う。外部リソースの方針までここで決めない
  if (url.origin !== self.location.origin) return

  if (BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return

  // ページ遷移（HTML）。サインイン後の一覧が入った HTML を端末に残さない
  if (request.mode === 'navigate' || request.destination === 'document') return

  event.respondWith(staleWhileRevalidate(request))
})

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  const update = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)

  if (cached !== undefined) return cached

  const fresh = await update
  return fresh === undefined ? Response.error() : fresh
}
