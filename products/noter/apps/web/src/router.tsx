import { createRouter as createTanStackRouter } from '@tanstack/react-router'
// routeTree.gen.ts はプラグインが生成する（git 管理外 / docs/parallel-lanes.md）
import { routeTree } from './routeTree.gen'

export const getRouter = () =>
  createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
  })

declare module '@tanstack/react-router' {
  // モジュール拡張は interface でしか行えないため、ここだけ例外
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
