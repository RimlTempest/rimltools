/**
 * ポータル（tools.riml4i.com）の HTML を tools.json から作る。ビルド時に 1 度だけ動く。
 * インライン script / style を持たない（_headers の CSP で禁じている）。
 */
export type PortalTool = {
  name: string
  title: string
  description: string
  host: string
  listed: boolean
}
export type PortalInput = {
  domain: string
  tools: PortalTool[]
}
export declare const renderIndex: (input: PortalInput) => string
export declare const renderNotFound: (_input: PortalInput) => string
//# sourceMappingURL=render.d.ts.map
