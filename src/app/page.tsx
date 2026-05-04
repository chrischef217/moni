import { redirect } from 'next/navigation'
import AdminDashboard from '@/components/AdminDashboard'
import AllowanceLogin from '@/components/AllowanceLogin'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getSessionFromCookies()

  if (!session) {
    return <AllowanceLogin />
  }

  if (session.role === 'freelancer') {
    redirect('/freelancer')
  }

  return <AdminDashboard session={session} />
}
