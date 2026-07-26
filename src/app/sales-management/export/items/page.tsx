import { redirect } from 'next/navigation'
import ExportProductSettingsPage from '@/components/ExportProductSettingsPage'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function ExportItemsPage() {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')

  return <ExportProductSettingsPage />
}
