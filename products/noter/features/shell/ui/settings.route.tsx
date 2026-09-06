import { createFileRoute } from '@tanstack/react-router'
import { SettingsScreen } from './settings-screen.tsx'
import { routerLink } from './router-link.tsx'

const Settings = () => <SettingsScreen renderLink={routerLink} />

export const Route = createFileRoute('/settings/account')({ component: Settings })
