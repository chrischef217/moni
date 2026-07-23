import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const SALES_UNITS = new Set(['kg', 'ea', 'box'])
const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const qty = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 1000) / 1000

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function loadAll(client: ReturnType<typeof createMoniServiceRoleClient>) {
  const [productsResult, variantsResult, clientsResult, peopleResult, clientPeopleResult, termsResult, agentsResult] = await Promise.all([
    client.from('products').select('id,product_name,product_code,product_spec,weight_g,product_type,is_active').eq('is_active', true).neq('product_type', '반제품').order('product_name'),
    client.from('sales_product_variants').select('*').eq('business_id', BUSINESS_ID).order('product_id').order('sort_order').order('variant_name'),
    client.from('sales_clients').select('id,company_name,status').eq('business_id', BUSINESS_ID).order('company_name'),
    client.from('business_people').select('id,name,status,person_type').eq('business_id', BUSINESS_ID).eq('person_type', 'sales_freelancer').order('name'),
    client.from('sales_client_people').select('client_id,person_id,active,is_primary').eq('business_id', BUSINESS_ID),
    client.from('sales_client_variant_terms').select('*').eq('business_id', BUSINESS_ID).order('client_id'),
    client.from('sales_client_variant_agents').select('*'),
  ])
  const failed = [productsResult, variantsResult, clientsResult, peopleResult, clientPeopleResult, termsResult, agentsResult].find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)

  const agentsByTerm = new Map<string, Record<string, unknown>[]>()
  for (const row of agentsResult.data ?? []) {
    const key = text(row.term_id)
    agentsByTerm.set(key, [...(agentsByTerm.get(key) ?? []), row])
  }
  const terms = (termsResult.data ?? []).map((row) => ({ ...row, agent_rates: agentsByTerm.get(text(row.id)) ?? [] }))
  const peopleByClient = new Map<string, string[]>()
  for (const row of clientPeopleResult.data ?? []) {
    if (row.active === false) continue
    const key = text(row.client_id)
    peopleByClient.set(key, [...(peopleByClient.get(key) ?? []), text(row.person_id)].filter(Boolean))
  }
  const clients = (clientsResult.data ?? []).map((row) => ({ ...row, assigned_person_ids: peopleByClient.get(text(row.id)) ?? [] }))

  return {
    products: productsResult.data ?? [],
    variants: variantsResult.data ?? [],
    clients,
    people: peopleResult.data ?? [],
    client_variant_terms: terms,
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    return NextResponse.json({ ok: true, ...(await loadAll(createMoniServiceRoleClient())) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '판매규격·단가 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })
    const action = text(body.action)
    const id = text(body.id)
    const data = (body.data ?? {}) as Record<string, unknown>
    const client = createMoniServiceRoleClient()

    if (action === 'save_variant') {
      const productId = text(data.product_id)
      const variantName = text(data.variant_name)
      const salesUnit = SALES_UNITS.has(text(data.sales_unit)) ? text(data.sales_unit) : 'kg'
      if (!productId) throw new Error('제품을 선택해 주세요.')
      if (!variantName) throw new Error('판매규격명을 입력해 주세요.')
      const productResult = await client.from('products').select('id,product_name,product_type').eq('id', productId).single()
      if (productResult.error) throw new Error(productResult.error.message)
      if (text(productResult.data.product_type) === '반제품') throw new Error('반제품은 판매규격으로 등록할 수 없습니다.')

      const unitWeightG = qty(data.unit_weight_g) > 0 ? qty(data.unit_weight_g) : null
      const boxUnits = qty(data.box_units) > 0 ? qty(data.box_units) : null
      if ((salesUnit === 'ea' || salesUnit === 'box') && !unitWeightG) throw new Error('EA/BOX 판매규격은 개별 중량(g)이 필요합니다.')
      if (salesUnit === 'box' && !boxUnits) throw new Error('BOX 판매규격은 박스 입수량이 필요합니다.')
      const isDefault = data.is_default === true
      const payload = {
        business_id: BUSINESS_ID,
        product_id: productId,
        variant_name: variantName,
        sales_unit: salesUnit,
        unit_weight_g: unitWeightG,
        box_units: boxUnits,
        default_unit_price: Math.max(0, money(data.default_unit_price)),
        moq_quantity: Math.max(0, qty(data.moq_quantity)),
        is_default: isDefault,
        active: data.active !== false,
        sort_order: Math.max(0, Math.round(num(data.sort_order))),
        note: text(data.note) || null,
        updated_at: new Date().toISOString(),
      }
      let result
      if (id) result = await client.from('sales_product_variants').update(payload).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      else result = await client.from('sales_product_variants').insert(payload).select('*').single()
      if (result.error) throw new Error(result.error.message)
      if (isDefault) {
        const reset = await client.from('sales_product_variants').update({ is_default: false }).eq('business_id', BUSINESS_ID).eq('product_id', productId).neq('id', result.data.id)
        if (reset.error) throw new Error(reset.error.message)
      }
      return NextResponse.json({ ok: true, variant: result.data })
    }

    if (action === 'save_client_variant_term') {
      const clientId = text(data.client_id)
      const variantId = text(data.variant_id)
      if (!clientId || !variantId) throw new Error('거래처와 판매규격을 선택해 주세요.')
      const variantResult = await client.from('sales_product_variants').select('*').eq('id', variantId).eq('business_id', BUSINESS_ID).single()
      if (variantResult.error) throw new Error(variantResult.error.message)
      if (variantResult.data.active === false) throw new Error('현재 중지된 판매규격입니다.')

      const termResult = await client.from('sales_client_variant_terms').upsert({
        business_id: BUSINESS_ID,
        client_id: clientId,
        variant_id: variantId,
        active: data.active !== false,
        unit_price: Math.max(0, money(data.unit_price)),
        moq_quantity: Math.max(0, qty(data.moq_quantity)),
        note: text(data.note) || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'client_id,variant_id' }).select('*').single()
      if (termResult.error) throw new Error(termResult.error.message)

      const termId = text(termResult.data.id)
      const removed = await client.from('sales_client_variant_agents').delete().eq('term_id', termId)
      if (removed.error) throw new Error(removed.error.message)

      const assignedResult = await client.from('sales_client_people').select('person_id').eq('client_id', clientId).eq('active', true)
      if (assignedResult.error) throw new Error(assignedResult.error.message)
      const assigned = new Set((assignedResult.data ?? []).map((row) => text(row.person_id)))
      const rawRates = Array.isArray(data.agent_rates) ? data.agent_rates : []
      const rates = rawRates.map((row) => row as Record<string, unknown>).map((row) => ({
        person_id: text(row.person_id),
        settlement_rate_per_kg: Math.max(0, money(row.settlement_rate_per_kg)),
      })).filter((row) => row.person_id && assigned.has(row.person_id) && row.settlement_rate_per_kg > 0)
      if (rates.length) {
        const inserted = await client.from('sales_client_variant_agents').insert(rates.map((row) => ({ ...row, term_id: termId })))
        if (inserted.error) throw new Error(inserted.error.message)
      }
      return NextResponse.json({ ok: true, term: termResult.data })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 판매규격 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '판매규격 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
