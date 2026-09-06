import { createFileRoute } from '@tanstack/react-router'
import { HomeScreen } from './home-screen.tsx'
import { routerLink } from './router-link.tsx'

const Home = () => <HomeScreen renderLink={routerLink} />

export const Route = createFileRoute('/')({ component: Home })
