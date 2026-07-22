import { redirect } from 'next/navigation'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams?: { view?: string }
}

export default async function SalesManagementPage({ searchParams }: PageProps) {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')

  const allowed = ['clients', 'sales', 'statements', 'statistics', 'tax-invoices']
  const requested = String(searchParams?.view ?? 'clients')
  const view = allowed.includes(requested) ? requested : 'clients'
  redirect(`/business-management?tab=sales-management&view=${view}`)
}
