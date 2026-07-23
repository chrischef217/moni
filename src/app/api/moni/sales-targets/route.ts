import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const OPEN_STAGES = new Set(['lead', 'contacted', 'proposal', 'negotiation'])
const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100

function todayKst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function monthRange(value: unknown) {
  const month = text(value) || todayKst().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('조회 월 형식이 올바르지 않습니다.')
  const start = `${month}-01`
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10)
  return { month, start, end }
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function loadTargets(client: ReturnType<typeof createMoniServiceRoleClient>, monthValue: unknown) {
  const range = monthRange(monthValue)
  const [targetsResult, salesResult, opportunitiesResult, peopleResult] = await Promise.all([
    client.from('sales_monthly_targets').select('*').eq('business_id', BUSINESS_ID).eq('target_month', range.start),
    client.from('sales_orders').select('id,total_amount,supply_amount,assigned_person_id,status').eq('business_id', BUSINESS_ID).gte('sale_date', range.start).lte('sale_date', range.end),
    client.from('sales_opportunities').select('id,title,stage,expected_amount,won_amount,close_date,assigned_person_id,client_id,next_action_date').eq('business_id', BUSINESS_ID),
    client.from('business_people').select('id,name,status,person_type').eq('business_id', BUSINESS_ID).eq('person_type', 'sales_freelancer').order('status').order('name'),
  ])
  const failed = [targetsResult, salesResult, opportunitiesResult, peopleResult].find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)

  const targets = targetsResult.data ?? []
  const sales = (salesResult.data ?? []).filter((row) => text(row.status) === 'confirmed')
  const opportunities = opportunitiesResult.data ?? []
  const companyTarget = targets.find((row) => text(row.scope_type) === 'company') ?? null
  const openMonthPipeline = opportunities.filter((row) => OPEN_STAGES.has(text(row.stage)) && text(row.close_date) >= range.start && text(row.close_date) <= range.end)
  const wonMonthPipeline = opportunities.filter((row) => text(row.stage) === 'won' && text(row.close_date) >= range.start && text(row.close_date) <= range.end)
  const openNoClose = opportunities.filter((row) => OPEN_STAGES.has(text(row.stage)) && !text(row.close_date))
  const actual = money(sales.reduce((sum, row) => sum + num(row.total_amount), 0))
  const targetAmount = companyTarget ? money(companyTarget.target_amount) : null
  const gap = targetAmount === null ? null : Math.max(0, money(targetAmount - actual))
  const attainment = targetAmount !== null && targetAmount > 0 ? Number(((actual / targetAmount) * 100).toFixed(1)) : null

  const personTargetById = new Map(targets.filter((row) => text(row.scope_type) === 'person').map((row) => [text(row.person_id), row]))
  const people = (peopleResult.data ?? []).map((person) => {
    const personId = text(person.id)
    const target = personTargetById.get(personId) ?? null
    const actualAmount = money(sales.filter((row) => text(row.assigned_person_id) === personId).reduce((sum, row) => sum + num(row.total_amount), 0))
    const pipelineAmount = money(openMonthPipeline.filter((row) => text(row.assigned_person_id) === personId).reduce((sum, row) => sum + num(row.expected_amount), 0))
    const personTargetAmount = target ? money(target.target_amount) : null
    return {
      ...person,
      target: target ? { id: target.id, target_amount: personTargetAmount, note: target.note } : null,
      actual_sales_amount: actualAmount,
      open_pipeline_amount: pipelineAmount,
      gap_amount: personTargetAmount === null ? null : Math.max(0, money(personTargetAmount - actualAmount)),
      attainment_rate: personTargetAmount !== null && personTargetAmount > 0 ? Number(((actualAmount / personTargetAmount) * 100).toFixed(1)) : null,
    }
  })

  return {
    range,
    basis: {
      target_and_actual: '부가세 포함 판매합계(total_amount) 기준',
      pipeline: '영업기회에 직접 입력된 expected_amount 원금액 기준. 확률 가중치 없음',
    },
    company: {
      target: companyTarget ? { id: companyTarget.id, target_amount: targetAmount, note: companyTarget.note } : null,
      actual_sales_amount: actual,
      gap_amount: gap,
      attainment_rate: attainment,
      open_pipeline_amount: money(openMonthPipeline.reduce((sum, row) => sum + num(row.expected_amount), 0)),
      open_pipeline_count: openMonthPipeline.length,
      won_pipeline_amount: money(wonMonthPipeline.reduce((sum, row) => sum + (num(row.won_amount) > 0 ? num(row.won_amount) : num(row.expected_amount)), 0)),
      won_pipeline_count: wonMonthPipeline.length,
      no_close_date_pipeline_amount: money(openNoClose.reduce((sum, row) => sum + num(row.expected_amount), 0)),
      no_close_date_pipeline_count: openNoClose.length,
    },
    people,
    opportunities: {
      open_month: openMonthPipeline,
      won_month: wonMonthPipeline,
      open_without_close_date: openNoClose,
    },
  }
}

async function saveTarget(client: ReturnType<typeof createMoniServiceRoleClient>, data: Record<string, unknown>) {
  const range = monthRange(data.month)
  const scopeType = text(data.scope_type) === 'person' ? 'person' : 'company'
  const personId = scopeType === 'person' ? text(data.person_id) : ''
  const targetAmount = money(data.target_amount)
  if (targetAmount < 0) throw new Error('목표매출은 0원 이상이어야 합니다.')
  if (scopeType === 'person') {
    if (!personId) throw new Error('영업 담당자를 선택해 주세요.')
    const personResult = await client.from('business_people').select('id,status,person_type').eq('id', personId).eq('business_id', BUSINESS_ID).single()
    if (personResult.error || text(personResult.data.person_type) !== 'sales_freelancer') throw new Error('영업 담당자를 확인해 주세요.')
  }
  let existingQuery = client.from('sales_monthly_targets').select('id').eq('business_id', BUSINESS_ID).eq('target_month', range.start).eq('scope_type', scopeType)
  if (scopeType === 'person') existingQuery = existingQuery.eq('person_id', personId)
  const existing = await existingQuery.maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  const payload = {
    business_id: BUSINESS_ID,
    target_month: range.start,
    scope_type: scopeType,
    person_id: scopeType === 'person' ? personId : null,
    target_amount: targetAmount,
    note: text(data.note) || null,
    updated_at: new Date().toISOString(),
  }
  if (existing.data?.id) {
    const updated = await client.from('sales_monthly_targets').update(payload).eq('id', existing.data.id).select('*').single()
    if (updated.error) throw new Error(updated.error.message)
    return updated.data
  }
  const inserted = await client.from('sales_monthly_targets').insert(payload).select('*').single()
  if (inserted.error) throw new Error(inserted.error.message)
  return inserted.data
}

async function clearTarget(client: ReturnType<typeof createMoniServiceRoleClient>, data: Record<string, unknown>) {
  const range = monthRange(data.month)
  const scopeType = text(data.scope_type) === 'person' ? 'person' : 'company'
  let query = client.from('sales_monthly_targets').delete().eq('business_id', BUSINESS_ID).eq('target_month', range.start).eq('scope_type', scopeType)
  if (scopeType === 'person') {
    const personId = text(data.person_id)
    if (!personId) throw new Error('영업 담당자를 선택해 주세요.')
    query = query.eq('person_id', personId)
  }
  const result = await query
  if (result.error) throw new Error(result.error.message)
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    return NextResponse.json({ ok: true, ...(await loadTargets(createMoniServiceRoleClient(), request.nextUrl.searchParams.get('month'))) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '영업 목표 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })
    const action = text(body.action)
    const data = (body.data ?? {}) as Record<string, unknown>
    const client = createMoniServiceRoleClient()
    if (action === 'save_target') return NextResponse.json({ ok: true, target: await saveTarget(client, data) })
    if (action === 'clear_target') { await clearTarget(client, data); return NextResponse.json({ ok: true }) }
    return NextResponse.json({ ok: false, error: '지원하지 않는 목표관리 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '영업 목표 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
