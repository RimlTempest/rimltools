/**
 * noter の Service Worker のキャッシュ方針（plan 007）。
 *
 *   /_serverFn/ /ws/ /api/ /d/ /s/ … 素通し
 *   ページ（HTML）                  … 素通し（下記）
 *   それ以外の GET                  … stale-while-revalidate（/assets/ は内容ハッシュ付き）
 *
 * **文書の本文はキャッシュしない。** 本文は Yjs がメモリと再送で持っている。
 * 古い本文を返す層を挟んでも、遅れて上書きされるだけで害しかない。
 *
 * **HTML もキャッシュしない。** 一覧（`/`）はサインインした人の文書名を含んだ状態で
 * 配信される。共有端末でこれがキャッシュに残ると、次の人に前の利用者の文書名が見えてしまう。
 */

import type { Decide } from '@rimltools/sw/handlers'

export const CACHE_NAME = 'noter-shell-v1'

/** 先に持っておくアプリシェル。HTML は入れない（上記の理由） */
export const PRECACHE: readonly string[] = ['/icon.svg']

// ネットワークへ直行させる path の接頭辞。
//   /_serverFn/ … 一覧・保存・共有（TanStack の server function）。
//                 GET のものがあり、これをキャッシュすると「共有リンクを
//                 失効させたのに一覧から消えない」が起きる。実際に e2e で
//                 再現した。利用者ごとに違う値でもあるので端末に残さない
//   /ws/        … Durable Object への WebSocket。SW が触ってよいものが無い
//   /api/       … 認証（Better Auth）
//   /d/         … 文書（画面と raw）。中身は Yjs が持つ
//   /s/         … 共有リンクの入口。トークンの解決は毎回サーバで行う
const BYPASS_PREFIXES: readonly string[] = ['/_serverFn/', '/ws/', '/api/', '/d/', '/s/']

export const decide: Decide = (request) => {
  if (request.method !== 'GET') return 'bypass'
  // プロトコルの切り替え（WebSocket など）には絶対に触らない。
  // /ws/ は下でも弾いているが、判定の順番に関わらず素通しさせる
  if (request.upgrade) return 'bypass'
  // 同一オリジンだけを扱う。外部リソースの方針までここで決めない
  if (!request.sameOrigin) return 'bypass'
  if (BYPASS_PREFIXES.some((prefix) => request.pathname.startsWith(prefix))) return 'bypass'
  // ページ遷移（HTML）。サインイン後の一覧が入った HTML を端末に残さない
  if (request.navigation) return 'bypass'
  return 'stale-while-revalidate'
}
