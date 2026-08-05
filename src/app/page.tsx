import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminDashboard from '@/components/AdminDashboard'
import AllowanceLogin from '@/components/AllowanceLogin'
import MainControlTowerDashboard from '@/components/MainControlTowerDashboard'
import PurchaseDashboardSummary from '@/components/PurchaseDashboardSummary'
import ControlTowerAlertFeed from '@/components/ControlTowerAlertFeed'
import { POST_LOGIN_COOKIE_NAME } from '@/lib/allowance/post-login'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

type HomePageProps = {
  searchParams?: {
    legacy?: string | string[]
  }
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || ''
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await getSessionFromCookies()

  if (!session) {
    return <AllowanceLogin />
  }

  if (cookies().get(POST_LOGIN_COOKIE_NAME)?.value) {
    redirect('/api/allowance/auth/post-login')
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
