import { redirect } from 'next/navigation'
import ExportDocumentPrintView from '@/components/ExportDocumentPrintView'
import ExportDocumentPrintRuntimeFix from '@/components/ExportDocumentPrintRuntimeFix'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function ExportDocumentPrintPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { type?: string; auto?: string }
}) {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')

  const type = searchParams?.type === 'invoice' || searchParams?.type === 'packing' ? searchParams.type : 'both'
  const autoPrint = searchParams?.auto === '1'

  return <>
    <ExportDocumentPrintRuntimeFix id={params.id} type={type} autoPrint={autoPrint} />
    <ExportDocumentPrintView id={params.id} type={type} autoPrint={false} />
  </>
}
