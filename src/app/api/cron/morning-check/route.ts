import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Deprecated 2026-07-25.
 *
 * The legacy morning-check used business_id='default', wrote directly to ai_alerts,
 * and had no cron authorization. It is intentionally retired rather than migrated
 * so the 111 historical ai_alerts rows remain untouched.
 *
 * Current alert detection: /api/cron/moni-alert-sync -> moni_alert_events.
 */
export async function GET() {
  return NextResponse.json({
    ok: false,
    deprecated: true,
    error: 'Legacy morning-check has been retired. MONI Alert/Event Backbone V10+ is the active alert system.',
  }, { status: 410 })
}
