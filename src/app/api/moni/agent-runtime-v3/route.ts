import { NextRequest } from 'next/server'
import { GET as v2GET, POST as v2POST } from '@/app/api/moni/agent-runtime-v2/route'
import { tryStartMobileManagement } from '@/lib/moni/mobile-management-direct'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return v2GET(request)
}

export async function POST(request: NextRequest) {
  try {
    const direct = await tryStartMobileManagement(request)
    if (direct) return direct
  } catch (error) {
    console.error('[MONI_MOBILE_MANAGEMENT_DIRECT_ERROR]', error)
  }
  return v2POST(request)
}
