import type { PortalInput, PortalTool } from '../src/render.ts'

/** tools.json（検証済み）からポータルに要る項目だけを取り出す */
export const toPortalInput = (registry: { domain: string; tools: PortalTool[] }): PortalInput => ({
  domain: registry.domain,
  tools: registry.tools.map(({ name, title, description, host, listed }) => ({
    name,
    title,
    description,
    host,
    listed,
  })),
})
