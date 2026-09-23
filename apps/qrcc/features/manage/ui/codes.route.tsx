import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { parseActorWire } from '@qrcc/auth/contract'
import { CodesScreen } from '@qrcc/manage/ui'
import type { CodeLinkRenderer } from '@qrcc/manage/ui'
import { browserManageDeps, manageContextFn } from './manage-wiring.route.ts'

/** ルータへの依存をこのファイルだけに閉じ込める（画面はルータなしでテストできる）。 */
const routerLink: CodeLinkRenderer = ({ to, label }) => <Link to={to}>{label}</Link>

const Codes = () => {
  const context = Route.useLoaderData()
  // 依存は 1 度だけ組み立てる。SSR 中は作らない（遅延初期化）
  const [deps] = useState(() => browserManageDeps(context.origin))

  return <CodesScreen actor={parseActorWire(context.actor)} deps={deps} renderLink={routerLink} />
}

export const Route = createFileRoute('/codes')({
  loader: () => manageContextFn(),
  component: Codes,
})
