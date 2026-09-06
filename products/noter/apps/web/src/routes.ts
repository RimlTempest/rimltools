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
  index('shell/ui/home.route.tsx'),
  route('/settings/account', 'shell/ui/settings.route.tsx'),
])
