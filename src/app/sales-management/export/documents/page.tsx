import { redirect } from 'next/navigation'
import ExportDocumentsPage from '@/components/ExportDocumentsPage'
import ExportDocumentsAutoSalesBridge from '@/components/ExportDocumentsAutoSalesBridge'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function ExportDocumentsRoute() {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')

  return <>
    <ExportDocumentsAutoSalesBridge />
    <ExportDocumentsPage />
  </>
}
