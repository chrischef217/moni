import { NextRequest, NextResponse } from 'next/server'
import { syncMoniBackgroundAlerts } from '@/lib/moni/backgroundAlertSync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET is not configured.' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized cron request.' }, { status: 401 })
  }

  try {
    const result = await syncMoniBackgroundAlerts()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'MONI background alert sync failed.',
    }, { status: 500 })
  }
}
