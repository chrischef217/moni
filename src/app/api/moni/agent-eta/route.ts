import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import {
  MONI_ETA_DEFAULTS,
  classifyMoniEtaKind,
  robustEtaEstimate,
  type MoniEtaKind,
} from '@/lib/moni/mobile-eta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const VALID_KINDS = new Set<MoniEtaKind>(Object.keys(MONI_ETA_DEFAULTS) as MoniEtaKind[])

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || session.role === 'freelancer') {
    return NextResponse.json({ ok: false, error: '인증이 필요합니다.' }, { status: 401 })
  }

  const requestedKind = String(request.nextUrl.searchParams.get('kind') || 'general') as MoniEtaKind
  const kind = VALID_KINDS.has(requestedKind) ? requestedKind : 'general'
  const supabase = createMoniServiceRoleClient()

  const { data: runs, error: runsError } = await supabase
    .from('moni_ai_agent_runs')
    .select('message_id,latency_ms,created_at')
    .eq('business_id', BUSINESS_ID)
    .eq('status', 'COMPLETED')
    .not('message_id', 'is', null)
    .not('latency_ms', 'is', null)
    .order('created_at', { ascending: false })
    .limit(120)

  if (runsError) {
    return NextResponse.json({
      ok: true,
      kind,
      estimate_seconds: MONI_ETA_DEFAULTS[kind],
      sample_count: 0,
      source: 'default',
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const messageIds = [...new Set((runs || []).map((row) => String(row.message_id || '')).filter(Boolean))]
  if (!messageIds.length) {
    return NextResponse.json({
      ok: true,
      kind,
      estimate_seconds: MONI_ETA_DEFAULTS[kind],
      sample_count: 0,
      source: 'default',
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: messages } = await supabase
    .from('moni_ai_messages')
    .select('id,content')
    .eq('business_id', BUSINESS_ID)
    .in('id', messageIds)

  const messageById = new Map((messages || []).map((row) => [String(row.id), String(row.content || '')]))
  const samples = (runs || [])
    .filter((row) => classifyMoniEtaKind(messageById.get(String(row.message_id || '')) || '') === kind)
    .map((row) => Number(row.latency_ms || 0) / 1000)
    .filter((seconds) => Number.isFinite(seconds) && seconds >= 2 && seconds <= 120)
    .slice(0, 16)

  return NextResponse.json({
    ok: true,
    kind,
    estimate_seconds: robustEtaEstimate(samples, MONI_ETA_DEFAULTS[kind]),
    sample_count: samples.length,
    source: samples.length >= 2 ? 'recent-runtime-history' : 'default',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
