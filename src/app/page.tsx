import { redirect } from 'next/navigation'
import AdminDashboard from '@/components/AdminDashboard'
import AllowanceLogin from '@/components/AllowanceLogin'
import MainControlTowerDashboard from '@/components/MainControlTowerDashboard'
import PurchaseDashboardSummary from '@/components/PurchaseDashboardSummary'
import ControlTowerAlertFeed from '@/components/ControlTowerAlertFeed'
import { getSessionFromCookies } from '@/lib/allowance/session'
import { isSafeRelativePath } from '@/lib/moni/mcp/config'

export const dynamic = 'force-dynamic'

type HomePageProps = {
  searchParams?: {
    legacy?: string | string[]
    return_to?: string | string[]
  }
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || ''
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await getSessionFromCookies()
  const rawReturnTo = first(searchParams?.return_to)
  const returnTo = isSafeRelativePath(rawReturnTo) ? rawReturnTo : ''

  if (!session) {
    return <AllowanceLogin returnTo={returnTo} />
  }

  if (returnTo) {
    redirect(returnTo)
  }

  if (session.role === 'freelancer') {
    redirect('/freelancer')
  }

  const legacy = first(searchParams?.legacy)
  if (legacy === '1') {
    return <AdminDashboard session={session} />
  }

  return (
    <>
      <MainControlTowerDashboard session={session} />
      <PurchaseDashboardSummary />
      <ControlTowerAlertFeed />
    </>
  )
}
