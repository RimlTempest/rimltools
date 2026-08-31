import { createFileRoute } from '@tanstack/react-router'
import { HomeScreen } from './home-screen.tsx'

export const Route = createFileRoute('/')({ component: HomeScreen })
