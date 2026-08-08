import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RETIRED = {
  error: 'gone',
  error_description: 'Legacy morning-check cron has been retired. MONI PMO monitoring uses the controlled automation path.',
}

export async function GET() {
  return NextResponse.json(RETIRED, {
    status: 410,
    headers: {
      'Cache-Control': 'no-store',
      'X-MONI-Legacy-Route': 'retired',
    },
  })
}

export async function POST() {
  return NextResponse.json(RETIRED, {
    status: 410,
    headers: {
      'Cache-Control': 'no-store',
      'X-MONI-Legacy-Route': 'retired',
    },
  })
}
