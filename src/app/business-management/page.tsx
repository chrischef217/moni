import { redirect } from 'next/navigation'
import BusinessManagementModule from '@/components/BusinessManagementModule'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams?: { tab?: string }
}

export default async function BusinessManagementPage({ searchParams }: PageProps) {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role === 'freelancer') redirect('/freelancer')

  const rawTab = searchParams?.tab
  const initialTab = rawTab === 'sales' || rawTab === 'accounting' ? rawTab : 'hr'

  return <BusinessManagementModule initialTab={initialTab} />
}
