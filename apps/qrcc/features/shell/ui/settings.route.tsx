import { createFileRoute } from '@tanstack/react-router'
import { SettingsScreen } from './settings-screen.tsx'
import { routerLink } from '@rimltools/shell'

const Settings = () => <SettingsScreen renderLink={routerLink} />

export const Route = createFileRoute('/settings')({ component: Settings })
