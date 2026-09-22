/**
 * qrcc の Service Worker のキャッシュ方針（plans/009-pwa.md）。
 *
 *   /assets/*        cache-first（内容ハッシュ付きファイル名なので事故らない）
 *   ページ（HTML）    公開ページだけ network-first で保存。ほかは network-only（保存しない）
 *   /_serverFn/*      キャッシュしない（保存・一覧・共有。POST もある）
 *   /api/auth/*       キャッシュしない（認証）
 *   それ以外          素通し
 */

import type { Decide } from '@rimltools/sw/handlers'

export const CACHE_NAME = 'qrcc-v1'

export const PRECACHE: readonly string[] = []

// HTML をキャッシュしてよいのは公開ページだけ。認証が要るページ
// （/codes, /codes/*, /shared/* など）は絶対に足さないこと。
// 共有端末で次の人に前の利用者のデータが見えてしまう。
const CACHEABLE_PAGES: ReadonlySet<string> = new Set([
  '/',
  '/print',
  '/settings',
  '/sign-in',
  '/nfc',
])

export const decide: Decide = (request) => {
  if (request.method !== 'GET') return 'bypass'
  // 同一オリジンだけを扱う。外部リソースの方針までここで決めない
  if (!request.sameOrigin) return 'bypass'
  if (request.pathname.startsWith('/_serverFn/')) return 'bypass'
  if (request.pathname.startsWith('/api/auth/')) return 'bypass'
  if (request.pathname.startsWith('/assets/')) return 'cache-first'
  if (request.navigation) {
    return CACHEABLE_PAGES.has(request.pathname) ? 'network-first' : 'network-only'
  }
  return 'bypass'
}
