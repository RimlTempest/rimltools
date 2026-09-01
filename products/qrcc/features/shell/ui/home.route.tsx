import { createFileRoute } from '@tanstack/react-router'
import { HomeScreen } from './home-screen.tsx'
import { routerLink } from './router-link.tsx'

const Home = () => (
  <HomeScreen renderLink={({ to, label }) => routerLink({ to, label, isCurrent: false })} />
)

export const Route = createFileRoute('/')({ component: Home })
