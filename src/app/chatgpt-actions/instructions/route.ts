import { NextResponse } from 'next/server'
import { MONI_GPT_INSTRUCTIONS } from '@/lib/moni/chatgpt-actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return new NextResponse(MONI_GPT_INSTRUCTIONS, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
