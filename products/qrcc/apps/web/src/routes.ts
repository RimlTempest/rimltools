/**
 * URL 構造の唯一の定義。ルートの実体は各 feature の中に co-location されている。
 *
 * ファイルパスは `router.routesDirectory`（= リポジトリルートの `features/`）からの
 * 相対パス。ここだけが feature を横断する場所で、それ以外のコードは
 * feature ディレクトリの中で完結する。
 */
import { index, rootRoute, route } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('shell/ui/root.route.tsx', [
  // トップページが生成と読み取りを兼ねる（/generate と /scan は廃止）
  index('shell/ui/home.route.tsx'),
  route('/print', 'print/ui/print.route.tsx'),
  route('/codes', 'manage/ui/codes.route.tsx'),
  route('/codes/$codeId', 'manage/ui/code-detail.route.tsx'),
  route('/settings', 'shell/ui/settings.route.tsx'),
  route('/sign-in', 'auth/ui/sign-in.route.tsx'),
  // Better Auth の HTTP 入口（Google のコールバックを含む）
  route('/api/auth/$', 'auth/ui/auth-api.route.tsx'),
  route('/shared/$token', 'manage/ui/shared/shared.route.tsx'),
])
