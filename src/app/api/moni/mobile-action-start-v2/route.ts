import { NextRequest } from 'next/server'
import { POST as legacyPOST } from '@/app/api/moni/mobile-action-start/route'
import { tryStartMobileManagement } from '@/lib/moni/mobile-management-direct'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const direct = await tryStartMobileManagement(request)
    if (direct) return direct
  } catch (error) {
    console.error('[MONI_MOBILE_MANAGEMENT_ACTION_START_ERROR]', error)
  }
  return legacyPOST(request)
}
