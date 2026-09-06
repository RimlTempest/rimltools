/**
 * URL 構造の唯一の定義。ルートの実体は各 feature の中に co-location されている。
 *
 * ファイルパスは `router.routesDirectory`（= リポジトリルートの `features/`）からの
 * 相対パス。ここだけが feature を横断する場所で、それ以外のコードは
 * feature ディレクトリの中で完結する。
 *
 * `/ws/:documentId` はここに書かない。ルータを通さず `src/server.ts` で
 * WebSocket の Upgrade を受ける（docs/architecture.md §8、plan 002）。
 */
import { index, rootRoute, route } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('shell/ui/root.route.tsx', [
  index('documents/ui/home.route.tsx'),
  // 新規作成は画面を持たない。ホームの <form method="post"> がここを叩き、
  // ゲストの Set-Cookie と 302 を 1 つの応答で返す。
  route('/new', 'documents/ui/new.route.ts'),
  route('/d/$documentId', 'documents/ui/document.route.tsx'),
  route('/d/$documentId/raw', 'documents/ui/raw.route.ts'),
  route('/s/$token', 'documents/ui/share-entry.route.tsx'),
  route('/sign-in', 'auth/ui/sign-in.route.tsx'),
  route('/settings/account', 'auth/ui/settings.route.tsx'),
  // Better Auth の HTTP エンドポイント。画面を持たない server route。
  route('/api/auth/$', 'auth/ui/api.route.ts'),
])
