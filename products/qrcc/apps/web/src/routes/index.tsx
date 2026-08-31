import { createFileRoute } from '@tanstack/react-router'

const Home = () => (
  <main id="main" tabIndex={-1}>
    <h1>qrcc</h1>
    <p>QR コードとバーコードを生成・読み取り・管理・印刷するツールです。</p>
    {/* 各機能は apps/web/src/features/* のレーンで実装する（docs/parallel-lanes.md） */}
  </main>
)

export const Route = createFileRoute('/')({ component: Home })
