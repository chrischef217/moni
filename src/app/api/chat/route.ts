import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RETIRED_RESPONSE = {
  error: 'gone',
  error_description: 'Legacy /api/chat has been retired. MONI uses the authenticated /api/moni/agent-chat runtime.',
}

function gone() {
  return NextResponse.json(RETIRED_RESPONSE, {
    status: 410,
    headers: {
      'Cache-Control': 'no-store',
      'X-MONI-Legacy-Route': 'retired',
    },
  })
}

export async function GET() {
  return gone()
}

export async function POST() {
  return gone()
}
