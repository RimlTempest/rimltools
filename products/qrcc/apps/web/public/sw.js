// qrcc の Service Worker。
//
// 素の JavaScript（ビルドを通さない。vite.config.ts にプラグインを足さないため）。
// typecheck も lint の型情報も効かないので、ロジックを増やさないこと。
// 増やしたくなったらビルドに組み込む判断（＝プラグイン導入）を改めてする。
//
// キャッシュの方針（plans/009-pwa.md）:
//   /assets/*        cache-first  （内容ハッシュ付きファイル名なので事故らない）
//   ページ（HTML）    network-first（失敗したらキャッシュ。デプロイを反映させるため）
//   /_serverFn/*      キャッシュしない（保存・一覧・共有。POST もある）
//   /api/auth/*       キャッシュしない（認証）
//   それ以外          素通し
//
// **新しい版をその場で即有効化する呼び出しはしない。** それをすると、
// 開いているページの途中でアセットの世代が入れ替わり、古い HTML が
// 新しいチャンクを要求して壊れる。新しい SW は次にページを開いたときに
// 有効になればよい。

const CACHE_NAME = 'qrcc-v1'

// HTML をキャッシュしてよいのは公開ページだけ。認証が要るページ
// （/codes, /codes/*, /shared/* など）は絶対に足さないこと。
// 共有端末で次の人に前の利用者のデータが見えてしまう。
const CACHEABLE_PAGES = new Set(['/', '/print', '/settings', '/sign-in', '/nfc'])

self.addEventListener('install', () => {
  // ここで即時有効化はしない。次にページを開いたときに有効化されればよい
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
  const { request } = event
  // GET 以外は一切触らない
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // 同一オリジンだけを扱う。外部リソースの方針までここで決めない
  if (url.origin !== self.location.origin) return

  // 保存・一覧・共有などのサーバ関数。POST もあるためキャッシュしない
  if (url.pathname.startsWith('/_serverFn/')) return

  // 認証エンドポイント
  if (url.pathname.startsWith('/api/auth/')) return

  // 内容ハッシュ付きの静的アセット。中身が変わればファイル名も変わるので
  // cache-first で構わない
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  // ページ遷移（HTML）。公開ページだけキャッシュしてよい
  if (request.mode === 'navigate' || request.destination === 'document') {
    if (CACHEABLE_PAGES.has(url.pathname)) {
      event.respondWith(networkFirstCacheable(request))
    } else {
      // /codes, /codes/*, /shared/* など。network-first だが保存はしない
      event.respondWith(networkFirstUncached(request))
    }
    return
  }

  // それ以外は素通し
})

const cacheFirst = async (request) => {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached !== undefined) return cached

  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

const networkFirstCacheable = async (request) => {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached !== undefined) return cached
    throw error
  }
}

// 認証が要るページ用。オフライン時にキャッシュへ落ちることすらしない
// （利用者のデータが次の人に見えてはならない）
const networkFirstUncached = async (request) => fetch(request)
