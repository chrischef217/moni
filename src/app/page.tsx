import { redirect } from 'next/navigation'
import AdminDashboard from '@/components/AdminDashboard'
import AllowanceLogin from '@/components/AllowanceLogin'
import MainControlTowerDashboard from '@/components/MainControlTowerDashboard'
import IntelligenceQuickAccess from '@/components/IntelligenceQuickAccess'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

type HomePageProps = {
  searchParams?: {
    legacy?: string | string[]
  }
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await getSessionFromCookies()

  if (!session) {
    return <AllowanceLogin />
  }

  if (session.role === 'freelancer') {
    redirect('/freelancer')
  }

  const legacy = Array.isArray(searchParams?.legacy) ? searchParams?.legacy[0] : searchParams?.legacy
  if (legacy === '1') {
    return <AdminDashboard session={session} />
  }

  return (
    <>
      <MainControlTowerDashboard session={session} />
      <IntelligenceQuickAccess />
    </>
  )
}
