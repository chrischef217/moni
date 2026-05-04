import { redirect } from 'next/navigation'
import AdminDashboard from '@/components/AdminDashboard'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getSessionFromCookies()

  if (!session) {
    redirect('/login')
  }

  if (session.role === 'freelancer') {
    redirect('/freelancer')
  }

  return <AdminDashboard session={session} />
}
