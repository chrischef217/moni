import { NextRequest, NextResponse } from 'next/server'
import { GET as getIntelligence } from '@/app/api/moni/intelligence/route'
import { GET as getReceivables } from '@/app/api/moni/receivables/route'
import { GET as getSalesTargets } from '@/app/api/moni/sales-targets/route'
import { GET as getFinancialControl } from '@/app/api/moni/financial-control/route'
import { GET as getProductionDashboard } from '@/app/api/moni/production-dashboard/route'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const SOURCE_REF = 'moni_intelligence_v7'
const USER_STATUSES = new Set(['new', 'acknowledged', 'in_progress', 'resolved', 'ignored', 'deferred'])
const OPEN_STATUSES = new Set(['new', 'sent', 'acknowledged', 'in_progress', 'deferred'])

type Json = Record<string, any>

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function parseResponse(responsePromise: Promise<Response>, label: string, required = false): Promise<Json> {
  try {
    const response = await responsePromise
    const payload = await response.json() as Json
    if (!response.ok || payload.ok === false) {
      if (required) throw new Error(`${label}: ${text(payload.error, 300) || '데이터 조회 실패'}`)
      return { ok: false, error: text(payload.error, 300) || `${label} 데이터 조회 실패` }
    }
    return payload
  } catch (error) {
    if (required) throw error
    return { ok: false, error: error instanceof Error ? error.message : `${label} 데이터 조회 실패` }
  }
}

function categoryFor(item: Json) {
  const id = text(item.id)
  if (id.includes('receivable')) return 'collection'
  if (id.includes('cash') || id.includes('account-balance')) return 'cash'
  if (id.includes('sales-target') || id.includes('pipeline')) return 'sales'
  if (id.includes('production') || id.includes('material')) return 'production'
  if (id.includes('vat') || id.includes('tax') || id.includes('settlement')) return 'tax'
  if (text(item.severity) === 'data') return 'data'
  return 'system'
}

function severityRank(value: string) {
  if (value === 'critical') return 0
  if (value === 'high') return 1
  if (value === 'attention') return 2
  if (value === 'data') return 3
  return 4
}

function statusRank(value: string) {
  if (value === 'new') return 0
  if (value === 'sent') return 1
  if (value === 'acknowledged') return 2
  if (value === 'in_progress') return 3
  if (value === 'deferred') return 4
  if (value === 'resolved') return 5
  return 6
}

function earliestOpenDue(receivables: Json, states: string[]) {
  const rows = Array.isArray(receivables.orders) ? receivables.orders : []
  return rows
    .filter((row: Json) => num(row.outstanding_amount) > 0 && states.includes(text(row.collection_state)) && text(row.due_date))
    .map((row: Json) => text(row.due_date, 20))
    .sort()[0] || null
}

function enrichItem(item: Json, receivables: Json, targets: Json, finance: Json, production: Json) {
  const id = text(item.id)
  let impactAmount = 0
  let dueDate: string | null = null

  if (id === 'overdue-receivables') {
    impactAmount = num(receivables.summary?.overdue_amount)
    dueDate = earliestOpenDue(receivables, ['overdue'])
  } else if (id === 'due-soon-receivables') {
    impactAmount = num(receivables.summary?.due_soon_amount)
    dueDate = earliestOpenDue(receivables, ['due_today', 'due_soon'])
  } else if (id === 'negative-30d-cash') {
    impactAmount = Math.abs(num(finance.summary?.planned_30d_net))
  } else if (id === 'sales-target-gap') {
    impactAmount = Math.max(0, num(targets.company?.gap_amount))
  } else if (id === 'production-material-risk') {
    impactAmount = Math.max(0, num(production.kpis?.risk?.known_purchase_cost_won))
  } else if (id === 'production-loss') {
    impactAmount = Math.max(0, num(production.kpis?.loss?.known_loss_cost_won))
  }

  return {
    impact_amount: Math.round((impactAmount + Number.EPSILON) * 100) / 100,
    due_date: dueDate,
  }
}

async function addHistory(client: ReturnType<typeof createMoniServiceRoleClient>, eventId: string, previousStatus: string | null, nextStatus: string, actorType: 'system' | 'user' | 'notification_gateway', note: string | null) {
  const result = await client.from('moni_alert_event_history').insert({
    business_id: BUSINESS_ID,
    event_id: eventId,
    previous_status: previousStatus,
    next_status: nextStatus,
    actor_type: actorType,
    note,
  })
  if (result.error) throw new Error(result.error.message)
}

async function syncIntelligence(request: NextRequest) {
  const [intelligence, receivables, targets, finance, production] = await Promise.all([
    parseResponse(getIntelligence(request), 'MONI Intelligence', true),
    parseResponse(getReceivables(request), '수금·미수금'),
    parseResponse(getSalesTargets(request), '영업 목표매출'),
    parseResponse(getFinancialControl(request), '현금흐름·세무'),
    parseResponse(getProductionDashboard(), '생산'),
  ])

  const items = (Array.isArray(intelligence.items) ? intelligence.items : [])
    .filter((item: Json) => text(item.severity) !== 'good')
  const client = createMoniServiceRoleClient()
  const existingResult = await client.from('moni_alert_events')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .eq('source_type', 'internal_rule')
    .eq('source_ref', SOURCE_REF)
  if (existingResult.error) throw new Error(existingResult.error.message)

  const existingByKey = new Map((existingResult.data ?? []).map((row) => [text(row.dedupe_key), row]))
  const activeKeys = new Set<string>()
  const now = new Date()
  const nowIso = now.toISOString()
  let created = 0
  let updated = 0
  let reopened = 0
  let resolved = 0

  for (const item of items) {
    const dedupeKey = `intelligence:${text(item.id, 160)}`
    activeKeys.add(dedupeKey)
    const old = existingByKey.get(dedupeKey) as Json | undefined
    const enrichment = enrichItem(item, receivables, targets, finance, production)
    const baseRow = {
      business_id: BUSINESS_ID,
      dedupe_key: dedupeKey,
      source_type: 'internal_rule',
      source_ref: SOURCE_REF,
      category: categoryFor(item),
      severity: ['critical', 'high', 'attention', 'data'].includes(text(item.severity)) ? text(item.severity) : 'info',
      title: text(item.title, 500) || 'MONI 알림',
      summary: text(item.summary, 2000) || null,
      recommended_action: text(item.action, 500) || null,
      impact_amount: enrichment.impact_amount,
      due_date: enrichment.due_date,
      deep_link: text(item.href, 1000) || null,
      evidence_json: Array.isArray(item.evidence) ? item.evidence.slice(0, 12).map((value: unknown) => text(value, 500)) : [],
      last_detected_at: nowIso,
    }

    if (!old) {
      const inserted = await client.from('moni_alert_events').insert({ ...baseRow, status: 'new' }).select('id,status').single()
      if (inserted.error) throw new Error(inserted.error.message)
      await addHistory(client, text(inserted.data.id), null, 'new', 'system', 'MONI Intelligence 규칙 최초 감지')
      created += 1
      continue
    }

    let nextStatus = text(old.status)
    let transitionNote: string | null = null
    const deferredUntil = text(old.deferred_until)
    if (nextStatus === 'resolved') {
      nextStatus = 'new'
      transitionNote = '해결된 조건이 다시 감지되어 재오픈'
    } else if (nextStatus === 'deferred' && deferredUntil && new Date(deferredUntil).getTime() <= now.getTime()) {
      nextStatus = 'new'
      transitionNote = '보류 기한 만료 후 조건이 계속되어 재오픈'
    }

    const updateRow: Json = { ...baseRow }
    if (nextStatus !== text(old.status)) {
      updateRow.status = nextStatus
      updateRow.read_at = null
      updateRow.acknowledged_at = null
      updateRow.deferred_until = null
      updateRow.resolved_at = null
      updateRow.reopened_at = nowIso
      updateRow.reopen_count = num(old.reopen_count) + 1
    }

    const updatedResult = await client.from('moni_alert_events').update(updateRow).eq('id', old.id).eq('business_id', BUSINESS_ID)
    if (updatedResult.error) throw new Error(updatedResult.error.message)
    updated += 1
    if (nextStatus !== text(old.status)) {
      await addHistory(client, text(old.id), text(old.status), nextStatus, 'system', transitionNote)
      reopened += 1
    }
  }

  for (const old of existingResult.data ?? []) {
    const dedupeKey = text(old.dedupe_key)
    if (activeKeys.has(dedupeKey) || ['resolved', 'ignored'].includes(text(old.status))) continue
    const result = await client.from('moni_alert_events').update({
      status: 'resolved',
      resolved_at: nowIso,
      deferred_until: null,
    }).eq('id', old.id).eq('business_id', BUSINESS_ID)
    if (result.error) throw new Error(result.error.message)
    await addHistory(client, text(old.id), text(old.status), 'resolved', 'system', 'MONI Intelligence 규칙 조건 해소')
    resolved += 1
  }

  return { created, updated, reopened, resolved, active: items.length, synced_at: nowIso }
}

async function loadEvents(request: NextRequest) {
  const client = createMoniServiceRoleClient()
  const status = text(request.nextUrl.searchParams.get('status'), 40)
  const severity = text(request.nextUrl.searchParams.get('severity'), 40)
  const category = text(request.nextUrl.searchParams.get('category'), 40)
  const limit = Math.max(1, Math.min(200, Math.round(num(request.nextUrl.searchParams.get('limit')) || 100)))

  let query = client.from('moni_alert_events').select('*').eq('business_id', BUSINESS_ID).order('last_detected_at', { ascending: false }).limit(limit)
  if (status && status !== 'all') query = query.eq('status', status)
  if (severity && severity !== 'all') query = query.eq('severity', severity)
  if (category && category !== 'all') query = query.eq('category', category)
  const result = await query
  if (result.error) throw new Error(result.error.message)

  const events = (result.data ?? []).sort((a, b) =>
    statusRank(text(a.status)) - statusRank(text(b.status)) ||
    severityRank(text(a.severity)) - severityRank(text(b.severity)) ||
    text(b.last_detected_at).localeCompare(text(a.last_detected_at)),
  )
  const open = events.filter((row) => OPEN_STATUSES.has(text(row.status)))
  return {
    events,
    summary: {
      open_count: open.length,
      critical_count: open.filter((row) => text(row.severity) === 'critical').length,
      high_count: open.filter((row) => text(row.severity) === 'high').length,
      unread_count: open.filter((row) => !row.read_at).length,
      acknowledged_count: open.filter((row) => text(row.status) === 'acknowledged').length,
      in_progress_count: open.filter((row) => text(row.status) === 'in_progress').length,
      deferred_count: open.filter((row) => text(row.status) === 'deferred').length,
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    return NextResponse.json({ ok: true, ...(await loadEvents(request)) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '알림을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Json | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 데이터가 없습니다.' }, { status: 400 })
    const action = text(body.action, 80)
    const client = createMoniServiceRoleClient()

    if (action === 'sync_intelligence') {
      return NextResponse.json({ ok: true, sync: await syncIntelligence(request) })
    }

    const id = text(body.id, 80)
    if (!id) return NextResponse.json({ ok: false, error: '알림 ID가 필요합니다.' }, { status: 400 })
    const currentResult = await client.from('moni_alert_events').select('*').eq('id', id).eq('business_id', BUSINESS_ID).single()
    if (currentResult.error) throw new Error(currentResult.error.message)
    const current = currentResult.data as Json

    if (action === 'mark_read') {
      if (!current.read_at) {
        const result = await client.from('moni_alert_events').update({ read_at: new Date().toISOString() }).eq('id', id).eq('business_id', BUSINESS_ID)
        if (result.error) throw new Error(result.error.message)
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'record_view') {
      const result = await client.from('moni_alert_events').update({
        view_count: num(current.view_count) + 1,
        read_at: current.read_at || new Date().toISOString(),
      }).eq('id', id).eq('business_id', BUSINESS_ID)
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true })
    }

    if (action === 'update_status') {
      const nextStatus = text(body.status, 40)
      if (!USER_STATUSES.has(nextStatus)) return NextResponse.json({ ok: false, error: '지원하지 않는 알림 상태입니다.' }, { status: 400 })
      const previousStatus = text(current.status)
      if (previousStatus === nextStatus) return NextResponse.json({ ok: true, unchanged: true })

      const nowIso = new Date().toISOString()
      const update: Json = { status: nextStatus }
      if (nextStatus === 'acknowledged') {
        update.acknowledged_at = current.acknowledged_at || nowIso
        update.read_at = current.read_at || nowIso
        update.deferred_until = null
      } else if (nextStatus === 'in_progress') {
        update.acknowledged_at = current.acknowledged_at || nowIso
        update.read_at = current.read_at || nowIso
        update.deferred_until = null
      } else if (nextStatus === 'resolved' || nextStatus === 'ignored') {
        update.resolved_at = nowIso
        update.read_at = current.read_at || nowIso
        update.deferred_until = null
      } else if (nextStatus === 'deferred') {
        const deferredUntil = text(body.deferred_until, 80)
        if (!deferredUntil || Number.isNaN(new Date(deferredUntil).getTime()) || new Date(deferredUntil).getTime() <= Date.now()) {
          return NextResponse.json({ ok: false, error: '현재 시각 이후의 보류 기한이 필요합니다.' }, { status: 400 })
        }
        update.deferred_until = new Date(deferredUntil).toISOString()
        update.read_at = current.read_at || nowIso
        update.resolved_at = null
      } else if (nextStatus === 'new') {
        update.read_at = null
        update.acknowledged_at = null
        update.resolved_at = null
        update.deferred_until = null
      }

      const result = await client.from('moni_alert_events').update(update).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (result.error) throw new Error(result.error.message)
      await addHistory(client, id, previousStatus, nextStatus, 'user', text(body.note, 1000) || null)
      return NextResponse.json({ ok: true, event: result.data })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 알림 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '알림 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
