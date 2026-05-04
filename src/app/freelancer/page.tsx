import { redirect } from 'next/navigation'
import FreelancerAllowancePage from '@/components/FreelancerAllowancePage'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function FreelancerPage() {
  const session = await getSessionFromCookies()

  if (!session) redirect('/login')
  if (session.role !== 'freelancer') redirect('/')

  return <FreelancerAllowancePage />
}
