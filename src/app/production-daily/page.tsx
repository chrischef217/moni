import { redirect } from 'next/navigation'
import ProductionDailyPage from '@/components/ProductionDailyPage'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function ProductionDailyRoute() {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role === 'freelancer') redirect('/freelancer')
  return <ProductionDailyPage />
}
