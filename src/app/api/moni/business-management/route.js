import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'

const TABLES = {
  people: {
    table: 'business_people',
    fields: [
      'name', 'person_type', 'status', 'phone', 'email', 'contract_start', 'contract_end',
      'commission_rate', 'pay_type', 'pay_rate', 'withholding_rate',
      'contract_document_ready', 'id_document_ready', 'bank_document_ready',
      'bank_name', 'bank_account_holder', 'bank_account_number', 'note',
    ],
  },
  clients: {
    table: 'sales_clients',
    fields: ['company_name', 'contact_name', 'phone', 'email', 'status', 'assigned_person_id', 'note'],
  },
  opportunities: {
    table: 'sales_opportunities',
    fields: [
      'client_id', 'title', 'stage', 'expected_amount', 'won_amount', 'close_date',
      'next_action_date', 'assigned_person_id', 'note',
    ],
  },
  activities: {
    table: 'sales_activities',
    fields: [
      'client_id', 'opportunity_id', 'activity_date', 'activity_type', 'summary',
      'next_action', 'next_action_date', 'assigned_person_id',
    ],
  },
  work_logs: {
    table: 'freelancer_work_logs',
    fields: ['person_id', 'work_date', 'hours', 'pay_amount_override', 'source_type', 'note'],
  },
  settlements: {
    table: 'freelancer_settlements',
    fields: ['status', 'memo'],
  },
}

const text = (value) => String(value ?? '').trim()
const num = (value) => {
  if (value === '' || value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const roundMoney = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const normalizeName = (value) => text(value).toLocaleLowerCase('ko-KR').replace(/\s+/g, '')

function currentMonth() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7)
}

function monthRange(month) {
  const value = text(month) || currentMonth()
  if (!/^\d{4}-\d{2}$/.test(value)) throw new Error('조회 월 형식이 올바르지 않습니다.')
  const start = `${value}-01`
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10)
  return { month: value, start, end }
}

function parseTimeMinutes(value) {
  const match = text(value).match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

function durationHours(startTime, endTime) {
  const start = parseTimeMinutes(startTime)
  const end = parseTimeMinutes(endTime)
  if (start === null || end === null) return null
  let diff = end - start
  if (diff < 0) diff += 1440
  if (diff < 0 || diff > 1440) return null
  return Math.round((diff / 60) * 100) / 100
}

function cleanPayload(entity, raw) {
  const config = TABLES[entity]
  if (!config) throw new Error('지원하지 않는 데이터 유형입니다.')
  const source = raw && typeof raw === 'object' ? raw : {}
  const cleaned = {}
  for (const field of config.fields) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue
    const value = source[field]
    if (['contract_start', 'contract_end', 'close_date', 'next_action_date', 'activity_date', 'work_date'].includes(field)) {
      cleaned[field] = text(value) || null
    } else if (['assigned_person_id', 'client_id', 'opportunity_id', 'person_id'].includes(field)) {
      cleaned[field] = text(value) || null
    } else if (['commission_rate', 'pay_rate', 'withholding_rate', 'expected_amount', 'won_amount', 'hours'].includes(field)) {
      cleaned[field] = num(value)
    } else if (field === 'pay_amount_override') {
      cleaned[field] = value === '' || value === null || value === undefined ? null : num(value)
    } else if (['contract_document_ready', 'id_document_ready', 'bank_document_ready'].includes(field)) {
      cleaned[field] = value === true
    } else {
      cleaned[field] = typeof value === 'string' ? value.trim() : value
    }
  }
  return cleaned
}

async function requireAdmin(request) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function loadRows(client, month) {
  const range = monthRange(month)
  const [peopleResult, clientsResult, opportunitiesResult, activitiesResult, workLogsResult, settlementsResult, productionResult] = await Promise.all([
    client.from('business_people').select('*').eq('business_id', BUSINESS_ID).order('status').order('name'),
    client.from('sales_clients').select('*').eq('business_id', BUSINESS_ID).order('status').order('company_name'),
    client.from('sales_opportunities').select('*').eq('business_id', BUSINESS_ID).order('updated_at', { ascending: false }),
    client.from('sales_activities').select('*').eq('business_id', BUSINESS_ID).order('activity_date', { ascending: false }).limit(300),
    client.from('freelancer_work_logs').select('*').eq('business_id', BUSINESS_ID).gte('work_date', range.start).lte('work_date', range.end).order('work_date', { ascending: false }),
    client.from('freelancer_settlements').select('*').eq('business_id', BUSINESS_ID).eq('settlement_month', range.start),
    client
      .from('production_records')
      .select('id, worker_name, work_date, start_time, end_time, status, product_name, lot_number')
      .gte('work_date', range.start)
      .lte('work_date', range.end)
      .order('work_date', { ascending: true }),
  ])

  const requiredResults = [peopleResult, clientsResult, opportunitiesResult, activitiesResult, workLogsResult, settlementsResult]
  const requiredError = requiredResults.find((result) => result.error)?.error
  if (requiredError) throw new Error(requiredError.message)

  return {
    range,
    people: peopleResult.data || [],
    clients: clientsResult.data || [],
    opportunities: opportunitiesResult.data || [],
    activities: activitiesResult.data || [],
    work_logs: workLogsResult.data || [],
    settlements: settlementsResult.data || [],
    production_records: productionResult.error ? [] : productionResult.data || [],
    production_warning: productionResult.error ? productionResult.error.message : '',
  }
}

function buildSettlementPreview(data) {
  const settlementByKey = new Map()
  for (const row of data.settlements) settlementByKey.set(`${row.person_id}:${row.source_type}`, row)

  const completedProduction = data.production_records.filter((record) => {
    const status = text(record.status).toLocaleLowerCase('ko-KR')
    return ['완료', '확정', 'completed', 'confirmed', 'done'].includes(status)
  })

  return data.people
    .filter((person) => person.person_type !== 'employee')
    .map((person) => {
      const sourceType = person.person_type === 'sales_freelancer' ? 'sales' : 'production'
      let gross = 0
      let detail = {}

      if (sourceType === 'sales') {
        const wonRows = data.opportunities.filter(
          (row) => row.assigned_person_id === person.id && row.stage === 'won' && row.close_date >= data.range.start && row.close_date <= data.range.end,
        )
        const salesBase = wonRows.reduce((sum, row) => sum + (num(row.won_amount) > 0 ? num(row.won_amount) : num(row.expected_amount)), 0)
        gross = roundMoney(salesBase * (num(person.commission_rate) / 100))
        detail = {
          won_count: wonRows.length,
          sales_base: roundMoney(salesBase),
          commission_rate: num(person.commission_rate),
          opportunities: wonRows.map((row) => ({ id: row.id, title: row.title, amount: num(row.won_amount) > 0 ? num(row.won_amount) : num(row.expected_amount) })),
        }
      } else {
        const personName = normalizeName(person.name)
        const productionRows = completedProduction.filter((row) => normalizeName(row.worker_name) === personName)
        let productionHours = 0
        let missingTimeCount = 0
        const productionDates = new Set()
        for (const row of productionRows) {
          productionDates.add(row.work_date)
          const hours = durationHours(row.start_time, row.end_time)
          if (hours === null) missingTimeCount += 1
          else productionHours += hours
        }

        const manualRows = data.work_logs.filter((row) => row.person_id === person.id)
        const manualHours = manualRows.reduce((sum, row) => sum + (row.pay_amount_override === null ? num(row.hours) : 0), 0)
        const overrideAmount = manualRows.reduce((sum, row) => sum + (row.pay_amount_override === null ? 0 : num(row.pay_amount_override)), 0)
        const workDates = new Set([...productionDates, ...manualRows.map((row) => row.work_date)])
        const payRate = num(person.pay_rate)

        if (person.pay_type === 'daily') gross = workDates.size * payRate + overrideAmount
        else if (person.pay_type === 'fixed') gross = workDates.size > 0 ? payRate + overrideAmount : overrideAmount
        else gross = (productionHours + manualHours) * payRate + overrideAmount

        gross = roundMoney(gross)
        detail = {
          production_record_count: productionRows.length,
          production_hours: roundMoney(productionHours),
          missing_time_count: missingTimeCount,
          manual_log_count: manualRows.length,
          manual_hours: roundMoney(manualHours),
          override_amount: roundMoney(overrideAmount),
          work_day_count: workDates.size,
          pay_type: person.pay_type,
          pay_rate: payRate,
        }
      }

      const withholdingRate = num(person.withholding_rate) || 3.3
      const withholdingAmount = roundMoney(gross * (withholdingRate / 100))
      const saved = settlementByKey.get(`${person.id}:${sourceType}`) || null
      return {
        person_id: person.id,
        person_name: person.name,
        person_type: person.person_type,
        source_type: sourceType,
        gross_amount: gross,
        withholding_rate: withholdingRate,
        withholding_amount: withholdingAmount,
        net_amount: roundMoney(gross - withholdingAmount),
        detail,
        saved,
      }
    })
    .filter((row) => row.gross_amount > 0 || row.saved || data.people.find((person) => person.id === row.person_id)?.status === 'active')
}

export async function GET(request) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const url = new URL(request.url)
    const client = createMoniServiceRoleClient()
    const data = await loadRows(client, url.searchParams.get('month') || currentMonth())
    return NextResponse.json({ ok: true, ...data, settlement_preview: buildSettlementPreview(data) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })
    const client = createMoniServiceRoleClient()

    if (body.action === 'save_settlements') {
      const data = await loadRows(client, body.month || currentMonth())
      const preview = buildSettlementPreview(data).filter((row) => row.gross_amount > 0)
      if (!preview.length) return NextResponse.json({ ok: true, saved: 0 })
      const payload = preview.map((row) => ({
        business_id: BUSINESS_ID,
        person_id: row.person_id,
        settlement_month: data.range.start,
        source_type: row.source_type,
        gross_amount: row.gross_amount,
        withholding_rate: row.withholding_rate,
        withholding_amount: row.withholding_amount,
        net_amount: row.net_amount,
        status: row.saved?.status || 'draft',
        detail_json: row.detail,
        memo: row.saved?.memo || null,
        updated_at: new Date().toISOString(),
      }))
      const result = await client
        .from('freelancer_settlements')
        .upsert(payload, { onConflict: 'business_id,person_id,settlement_month,source_type' })
        .select('*')
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, saved: result.data?.length || 0, settlements: result.data || [] })
    }

    const entity = text(body.entity)
    const config = TABLES[entity]
    if (!config || entity === 'settlements') return NextResponse.json({ ok: false, error: '저장할 항목이 올바르지 않습니다.' }, { status: 400 })
    const payload = {
      ...cleanPayload(entity, body.data),
      business_id: BUSINESS_ID,
      updated_at: new Date().toISOString(),
    }
    const result = await client.from(config.table).insert(payload).select('*').single()
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true, row: result.data })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null)
    const entity = text(body?.entity)
    const id = text(body?.id)
    const config = TABLES[entity]
    if (!config || !id) return NextResponse.json({ ok: false, error: '수정 대상이 올바르지 않습니다.' }, { status: 400 })
    const client = createMoniServiceRoleClient()
    const payload = { ...cleanPayload(entity, body.data), updated_at: new Date().toISOString() }
    const result = await client.from(config.table).update(payload).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true, row: result.data })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수정 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const url = new URL(request.url)
    const entity = text(url.searchParams.get('entity'))
    const id = text(url.searchParams.get('id'))
    const config = TABLES[entity]
    if (!config || !id || ['people', 'clients', 'settlements'].includes(entity)) {
      return NextResponse.json({ ok: false, error: '삭제 대상이 올바르지 않습니다. 인력과 고객사는 비활성 처리해 주세요.' }, { status: 400 })
    }
    const client = createMoniServiceRoleClient()
    const result = await client.from(config.table).delete().eq('id', id).eq('business_id', BUSINESS_ID)
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
