import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RETIRED = {
  error: 'gone',
  error_description: 'Legacy /api/export/excel has been retired. Use current MONI module-specific export functions.',
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
