import { NextResponse } from 'next/server'
import { readAuditRecords } from '@/app/audit/lib/storage'
import type { AuditRecordsResponse } from '@/app/audit/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const records = await readAuditRecords()
    return NextResponse.json<AuditRecordsResponse>({ ok: true, records }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '감사 기록을 불러오지 못했습니다.'
    return NextResponse.json<AuditRecordsResponse>({ ok: false, error: message }, { status: 500 })
  }
}
