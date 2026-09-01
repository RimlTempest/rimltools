/**
 * URL 構造の唯一の定義。ルートの実体は各 feature の中に co-location されている。
 *
 * ファイルパスは `router.routesDirectory`（= リポジトリルートの `features/`）からの
 * 相対パス。ここだけが feature を横断する場所で、それ以外のコードは
 * feature ディレクトリの中で完結する。
 */
import { index, rootRoute, route } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('shell/ui/root.route.tsx', [
  index('shell/ui/home.route.tsx'),
  route('/generate', 'generate/ui/generate.route.tsx'),
  route('/print', 'print/ui/print.route.tsx'),
  route('/scan', 'scan/ui/scan.route.tsx'),
  route('/settings', 'shell/ui/settings.route.tsx'),
  route('/sign-in', 'auth/ui/sign-in.route.tsx'),
  // Better Auth の HTTP 入口（Google のコールバックを含む）
  route('/api/auth/$', 'auth/ui/auth-api.route.tsx'),
])
