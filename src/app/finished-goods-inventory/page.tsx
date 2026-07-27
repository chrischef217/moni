import { redirect } from 'next/navigation'
import FinishedGoodsInventoryAdjustmentBridge from '@/components/FinishedGoodsInventoryAdjustmentBridge'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export default async function FinishedGoodsInventoryRoute() {
  const session = await getSessionFromCookies()
  if (!session) redirect('/')
  if (session.role === 'freelancer') redirect('/freelancer')
  return <FinishedGoodsInventoryAdjustmentBridge />
}
