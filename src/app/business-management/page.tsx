import { redirect } from 'next/navigation'
import BusinessManagementIntegratedShell from '@/components/BusinessManagementIntegratedShell'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams?: { tab?: string; view?: string }
}

export default async function BusinessManagementPage({ searchParams }: PageProps) {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role === 'freelancer') redirect('/freelancer')

  const rawTab = searchParams?.tab
  const initialTab = rawTab === 'sales-management'
    ? 'salesManagement'
    : rawTab === 'sales' || rawTab === 'accounting'
      ? rawTab
      : 'hr'
  const initialView = String(searchParams?.view ?? '')

  return <BusinessManagementIntegratedShell initialTab={initialTab} initialView={initialView} />
}
