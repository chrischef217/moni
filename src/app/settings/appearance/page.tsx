import { redirect } from 'next/navigation'
import AppearanceSettingsModule from '@/components/AppearanceSettingsModule'
import CompanySettingsModule from '@/components/CompanySettingsModule'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function AppearanceSettingsPage({
  searchParams,
}: {
  searchParams?: { section?: string }
}) {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')

  if (searchParams?.section === 'company') return <CompanySettingsModule />
  return <AppearanceSettingsModule />
}
