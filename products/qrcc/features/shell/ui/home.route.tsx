import { createFileRoute } from '@tanstack/react-router'
import { GenerateSection } from '@qrcc/generate/ui/wiring'
import { ScanSection } from '@qrcc/scan/ui/wiring'
import { HomeScreen } from './home-screen.tsx'
import { routerLink } from './router-link.tsx'

/**
 * トップページの composition root。
 *
 * 生成と読み取りはそれぞれの feature が配線済みの部品として持っていて、
 * ここは「トップに、この順で、h2 で並べる」ことだけを決める。
 */
const Home = () => (
  <HomeScreen
    renderLink={({ to, label }) => routerLink({ to, label, isCurrent: false })}
    generate={<GenerateSection headingLevel={2} />}
    scan={<ScanSection headingLevel={2} />}
  />
)

export const Route = createFileRoute('/')({ component: Home })
