import { redirect } from 'next/navigation'
import MoniIntelligenceModule from '@/components/MoniIntelligenceModule'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function IntelligencePage() {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role !== 'admin') redirect('/freelancer')
  return <MoniIntelligenceModule />
}
