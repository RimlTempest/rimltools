import type { Tool } from '../lib/tools.ts'

export const qrcc: Tool = {
  name: 'qrcc',
  title: 'QR',
  description: 'd',
  path: 'products/qrcc',
  subdomain: 'qrcc',
  apex: false,
  listed: true,
  host: 'qrcc.tools.example.com',
  stagingHost: 'qrcc-staging.tools.example.com',
  legacyHosts: ['qrcc.example.com'],
  rust: true,
  workers: [
    {
      name: 'qrcc-api',
      role: 'internal',
      buildConfig: 'apps/web/dist/qrcc_api/wrangler.json',
      durableObjects: false,
    },
    {
      name: 'qrcc-web',
      role: 'public',
      buildConfig: 'apps/web/dist/server/wrangler.json',
      durableObjects: false,
    },
  ],
  d1: [{ name: 'qrcc', binding: 'DB', migrationsConfig: 'apps/api/wrangler.jsonc' }],
  release: { mode: 'canary', steps: [10, 50, 100], bakeMinutes: 10 },
  slo: { availability: 99.5, windowDays: 28 },
  smoke: { cli: 'bun run smoke', browser: 'bun run smoke:browser', e2ePackage: '@qrcc/e2e' },
}

export const noter: Tool = {
  ...qrcc,
  name: 'noter',
  path: 'products/noter',
  subdomain: 'noter',
  host: 'noter.tools.example.com',
  stagingHost: 'noter-staging.tools.example.com',
  rust: false,
  workers: [
    {
      name: 'noter-sync',
      role: 'internal',
      buildConfig: 'apps/web/dist/noter_sync/wrangler.json',
      durableObjects: true,
    },
    {
      name: 'noter-web',
      role: 'public',
      buildConfig: 'apps/web/dist/server/wrangler.json',
      durableObjects: false,
    },
  ],
  d1: [{ name: 'noter', binding: 'DB', migrationsConfig: 'apps/web/wrangler.jsonc' }],
}

export const portal: Tool = {
  ...qrcc,
  name: 'portal',
  title: 'RimlTools',
  path: 'products/portal',
  subdomain: 'portal',
  apex: true,
  listed: false,
  host: 'tools.example.com',
  stagingHost: 'staging.tools.example.com',
  legacyHosts: [],
  rust: false,
  workers: [
    {
      name: 'rimltools-portal',
      role: 'public',
      buildConfig: 'wrangler.jsonc',
      durableObjects: false,
    },
  ],
  d1: [],
  release: { mode: 'big-bang', steps: [100], bakeMinutes: 0 },
  smoke: { cli: 'bun run smoke', browser: 'bun run smoke', e2ePackage: '@rimltools/portal' },
}
