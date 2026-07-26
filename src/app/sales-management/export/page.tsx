import { redirect } from 'next/navigation'
import ExportDestinationManagementPage from '@/components/ExportDestinationManagementPage'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function SalesExportManagementPage() {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')

  return <ExportDestinationManagementPage />
}
