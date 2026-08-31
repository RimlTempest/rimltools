import { createFileRoute } from '@tanstack/react-router'
import { GenerateScreen } from './generate-screen.tsx'

export const Route = createFileRoute('/generate')({ component: GenerateScreen })
