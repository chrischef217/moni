import { redirect } from 'next/navigation'
import AppearanceSettingsModule from '@/components/AppearanceSettingsModule'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function AppearanceSettingsPage() {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')

  return <AppearanceSettingsModule />
}
