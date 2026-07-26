import { redirect } from 'next/navigation'
import AdminSettingsHub from '@/components/AdminSettingsHub'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage() {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')

  return <AdminSettingsHub />
}
