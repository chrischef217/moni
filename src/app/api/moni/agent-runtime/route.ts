import { type NextRequest } from 'next/server'
import { GET as baseGET, POST as basePOST } from './base-route'
import { tryDirectPriceLookup } from '@/lib/moni/agent/direct-price-lookup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProbeBody = {
  message?: unknown
  page?: unknown
  thread_id?: unknown
  attachment_ids?: unknown
}

export async function GET(request: NextRequest) {
  return baseGET(request)
}

export async function POST(request: NextRequest) {
  const probe = request.clone()
  const body = await probe.json().catch(() => null) as ProbeBody | null

  if (body) {
    const direct = await tryDirectPriceLookup(request, body)
    if (direct) return direct
  }

  return basePOST(request)
}
