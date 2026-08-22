import { redirect } from 'next/navigation'
import ExportSalesStatementPrintView from '@/components/ExportSalesStatementPrintView'
import ExportStatementBalanceEnhancer from '@/components/ExportStatementBalanceEnhancer'
import ExportStatementPaymentAccountEnhancer from '@/components/ExportStatementPaymentAccountEnhancer'
import ExportStatementVatLabelEnhancer from '@/components/ExportStatementVatLabelEnhancer'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function ExportTransactionStatementPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { auto?: string }
}) {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')

  return <>
    <ExportStatementBalanceEnhancer id={params.id} />
    <ExportStatementPaymentAccountEnhancer />
    <ExportStatementVatLabelEnhancer />
    <ExportSalesStatementPrintView id={params.id} autoPrint={searchParams?.auto === '1'} />
  </>
}
