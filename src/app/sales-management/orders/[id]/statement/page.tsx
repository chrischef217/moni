import { redirect } from 'next/navigation'
import { getSessionFromCookies } from '@/lib/allowance/session'
import DomesticSalesStatementPrintView from '@/components/DomesticSalesStatementPrintView'

export const dynamic = 'force-dynamic'

type Props = { params: { id: string }; searchParams?: { auto?: string } }

export default async function DomesticSalesStatementPage({ params, searchParams }: Props) {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')
  return <DomesticSalesStatementPrintView id={params.id} autoPrint={searchParams?.auto === '1'} />
}
