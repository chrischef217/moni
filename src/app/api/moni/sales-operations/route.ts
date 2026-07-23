import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const SALES_UNITS = new Set(['kg', 'ea', 'box'])

const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const roundKg = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 1000) / 1000

function todayKst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function currentMonth() {
  return todayKst().slice(0, 7)
}

function monthRange(monthValue: unknown) {
  const month = text(monthValue) || currentMonth()
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('조회 월 형식이 올바르지 않습니다.')
  const start = `${month}-01`
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10)
  return { month, start, end }
}

function validDate(value: unknown) {
  const date = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

function normalizedUnit(value: unknown, fallback = 'kg') {
  const unit = text(value).toLowerCase()
  return SALES_UNITS.has(unit) ? unit : fallback
}

function cleanClient(raw: Record<string, unknown> | null | undefined) {
  const source = raw ?? {}
  const assignedPersonIds = Array.isArray(source.assigned_person_ids)
    ? Array.from(new Set(source.assigned_person_ids.map(text).filter(Boolean)))
    : []
  return {
    row: {
      company_name: text(source.company_name),
      business_registration_number: text(source.business_registration_number) || null,
      representative_name: text(source.representative_name) || null,
      address: text(source.address) || null,
      contact_name: text(source.contact_name) || null,
      phone: text(source.phone) || null,
      email: text(source.email) || null,
      payment_terms: text(source.payment_terms) || null,
      assigned_person_id: assignedPersonIds[0] || null,
      status: text(source.status) === 'inactive' ? 'inactive' : 'active',
      note: text(source.note) || null,
      updated_at: new Date().toISOString(),
    },
    assignedPersonIds,
  }
}

function quantityKg(quantity: number, unit: string, setting: Record<string, unknown>) {
  if (unit === 'kg') return roundKg(quantity)
  const unitWeightG = num(setting.unit_weight_g)
  if (unitWeightG <= 0) throw new Error('EA/BOX 판매를 위해 제품 판매설정의 개별 중량(g)을 입력해 주세요.')
  if (unit === 'ea') return roundKg(quantity * unitWeightG / 1000)
  const cartonUnits = num(setting.carton_units)
  if (cartonUnits <= 0) throw new Error('BOX 판매를 위해 제품 판매설정의 카톤박스 입수량을 입력해 주세요.')
  return roundKg(quantity * cartonUnits * unitWeightG / 1000)
}

async function nextStatementNumber(client: ReturnType<typeof createMoniServiceRoleClient>, saleDate: string) {
  const prefix = `DB-${saleDate.replaceAll('-', '')}-`
  const result = await client.from('sales_orders')
    .select('statement_number')
    .eq('business_id', BUSINESS_ID)
    .like('statement_number', `${prefix}%`)
    .order('statement_number', { ascending: false })
    .limit(1)
  if (result.error) throw new Error(result.error.message)
  const latest = text(result.data?.[0]?.statement_number)
  const sequence = latest.startsWith(prefix) ? Number(latest.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(Number.isFinite(sequence) ? sequence : 1).padStart(3, '0')}`
}

async function syncClientPeople(
  client: ReturnType<typeof createMoniServiceRoleClient>,
  clientId: string,
  personIds: string[],
) {
  const allowed = personIds.length
    ? await client.from('business_people').select('id').eq('business_id', BUSINESS_ID).eq('person_type', 'sales_freelancer').eq('status', 'active').in('id', personIds)
    : { data: [], error: null }
  if (allowed.error) throw new Error(allowed.error.message)
  const validIds = (allowed.data ?? []).map((row) => text(row.id))

  const existing = await client.from('sales_client_people').select('id,person_id').eq('client_id', clientId)
  if (existing.error) throw new Error(existing.error.message)
  const deleteIds = (existing.data ?? []).filter((row) => !validIds.includes(text(row.person_id))).map((row) => row.id)
  if (deleteIds.length) {
    const removed = await client.from('sales_client_people').delete().in('id', deleteIds)
    if (removed.error) throw new Error(removed.error.message)
  }

  if (validIds.length) {
    const upserted = await client.from('sales_client_people').upsert(validIds.map((personId, index) => ({
      business_id: BUSINESS_ID,
      client_id: clientId,
      person_id: personId,
      is_primary: index === 0,
      active: true,
      updated_at: new Date().toISOString(),
    })), { onConflict: 'client_id,person_id' })
    if (upserted.error) throw new Error(upserted.error.message)
  }

  const termRows = await client.from('sales_client_product_terms').select('id').eq('client_id', clientId)
  if (termRows.error) throw new Error(termRows.error.message)
  const termIds = (termRows.data ?? []).map((row) => text(row.id))
  if (termIds.length) {
    const agentRows = await client.from('sales_client_product_agents').select('id,person_id').in('term_id', termIds)
    if (agentRows.error) throw new Error(agentRows.error.message)
    const staleAgentIds = (agentRows.data ?? []).filter((row) => !validIds.includes(text(row.person_id))).map((row) => row.id)
    if (staleAgentIds.length) {
      const removedAgents = await client.from('sales_client_product_agents').delete().in('id', staleAgentIds)
      if (removedAgents.error) throw new Error(removedAgents.error.message)
    }
  }
  return validIds
}

async function loadData(client: ReturnType<typeof createMoniServiceRoleClient>, monthValue: unknown) {
  const range = monthRange(monthValue)
  const [clientsResult, peopleResult, productsResult, settingsResult, clientPeopleResult, termsResult, ordersResult, settlementsResult] = await Promise.all([
    client.from('sales_clients').select('*').eq('business_id', BUSINESS_ID).order('status').order('company_name'),
    client.from('business_people').select('id,name,person_type,status,phone,email,commission_rate').eq('business_id', BUSINESS_ID).eq('person_type', 'sales_freelancer').order('status').order('name'),
    client.from('products').select('id,product_name,product_code,product_spec,weight_g,is_active,business_id').eq('is_active', true).order('product_name'),
    client.from('sales_product_settings').select('*').eq('business_id', BUSINESS_ID),
    client.from('sales_client_people').select('*').eq('business_id', BUSINESS_ID).eq('active', true),
    client.from('sales_client_product_terms').select('*').eq('business_id', BUSINESS_ID),
    client.from('sales_orders').select('*').eq('business_id', BUSINESS_ID).gte('sale_date', range.start).lte('sale_date', range.end).order('sale_date', { ascending: false }).order('created_at', { ascending: false }),
    client.from('sales_order_item_settlements').select('*').eq('business_id', BUSINESS_ID).gte('sale_date', range.start).lte('sale_date', range.end).order('sale_date'),
  ])
  const failed = [clientsResult, peopleResult, productsResult, settingsResult, clientPeopleResult, termsResult, ordersResult, settlementsResult].find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)

  const termIds = (termsResult.data ?? []).map((row) => row.id)
  const termAgentsResult = termIds.length
    ? await client.from('sales_client_product_agents').select('*').in('term_id', termIds)
    : { data: [], error: null }
  if (termAgentsResult.error) throw new Error(termAgentsResult.error.message)

  const orders = ordersResult.data ?? []
  const orderIds = orders.map((row) => row.id)
  const itemsResult = orderIds.length
    ? await client.from('sales_order_items').select('*').in('order_id', orderIds).order('sort_order').order('created_at')
    : { data: [], error: null }
  if (itemsResult.error) throw new Error(itemsResult.error.message)

  const peopleByClient = new Map<string, string[]>()
  for (const row of clientPeopleResult.data ?? []) {
    const key = text(row.client_id)
    peopleByClient.set(key, [...(peopleByClient.get(key) ?? []), text(row.person_id)])
  }
  const clients = (clientsResult.data ?? []).map((row) => ({ ...row, assigned_person_ids: peopleByClient.get(text(row.id)) ?? [] }))

  const settingByProduct = new Map((settingsResult.data ?? []).map((row) => [text(row.product_id), row]))
  const products = (productsResult.data ?? []).map((row) => ({ ...row, sales_setting: settingByProduct.get(text(row.id)) ?? null }))

  const agentsByTerm = new Map<string, Record<string, unknown>[]>()
  for (const row of termAgentsResult.data ?? []) {
    const key = text(row.term_id)
    agentsByTerm.set(key, [...(agentsByTerm.get(key) ?? []), row])
  }
  const terms = (termsResult.data ?? []).map((row) => ({ ...row, agent_rates: agentsByTerm.get(text(row.id)) ?? [] }))

  const itemsByOrder = new Map<string, Record<string, unknown>[]>()
  for (const row of itemsResult.data ?? []) {
    const key = text(row.order_id)
    itemsByOrder.set(key, [...(itemsByOrder.get(key) ?? []), row])
  }
  const hydratedOrders = orders.map((row) => ({ ...row, items: itemsByOrder.get(text(row.id)) ?? [] }))

  const orderStatusById = new Map(hydratedOrders.map((row) => [text(row.id), text(row.status)]))
  const validSettlements = (settlementsResult.data ?? []).filter((row) => orderStatusById.get(text(row.order_id)) !== 'cancelled')
  const clientById = new Map(clients.map((row) => [text(row.id), row]))
  const productById = new Map(products.map((row) => [text(row.id), row]))
  const settlementRows = validSettlements.map((row) => ({
    ...row,
    client_name: text(clientById.get(text(row.client_id))?.company_name) || '미지정 거래처',
    product_name: text(productById.get(text(row.product_id))?.product_name) || '제품',
  }))

  const confirmedOrders = hydratedOrders.filter((row) => row.status === 'confirmed')
  const summary = confirmedOrders.reduce((acc, row) => {
    acc.order_count += 1
    acc.supply_amount += num(row.supply_amount)
    acc.total_amount += num(row.total_amount)
    if (row.payment_status !== 'paid') acc.unpaid_amount += num(row.total_amount)
    return acc
  }, { order_count: 0, supply_amount: 0, total_amount: 0, unpaid_amount: 0 })

  const settlementSummary = settlementRows.reduce((acc, row) => {
    acc.total_amount += num(row.settlement_amount)
    acc.total_kg += num(row.quantity_kg)
    acc.people.add(text(row.person_id))
    return acc
  }, { total_amount: 0, total_kg: 0, people: new Set<string>() })

  return {
    range,
    clients,
    people: peopleResult.data ?? [],
    products,
    product_settings: settingsResult.data ?? [],
    client_people: clientPeopleResult.data ?? [],
    client_product_terms: terms,
    orders: hydratedOrders,
    settlements: settlementRows,
    summary: {
      order_count: summary.order_count,
      supply_amount: money(summary.supply_amount),
      total_amount: money(summary.total_amount),
      unpaid_amount: money(summary.unpaid_amount),
      settlement_amount: money(settlementSummary.total_amount),
      settlement_kg: roundKg(settlementSummary.total_kg),
      settlement_people: settlementSummary.people.size,
    },
  }
}

async function saveProductSetting(client: ReturnType<typeof createMoniServiceRoleClient>, data: Record<string, unknown>) {
  const productId = text(data.product_id)
  if (!productId) throw new Error('제품을 선택해 주세요.')
  const unit = normalizedUnit(data.default_sales_unit)
  const payload = {
    business_id: BUSINESS_ID,
    product_id: productId,
    is_sellable: data.is_sellable !== false,
    default_sales_unit: unit,
    unit_weight_g: num(data.unit_weight_g) > 0 ? roundKg(data.unit_weight_g) : null,
    carton_units: num(data.carton_units) > 0 ? roundKg(data.carton_units) : null,
    default_unit_price: Math.max(0, money(data.default_unit_price)),
    moq_quantity: Math.max(0, roundKg(data.moq_quantity)),
    note: text(data.note) || null,
    updated_at: new Date().toISOString(),
  }
  if ((unit === 'ea' || unit === 'box') && !payload.unit_weight_g) throw new Error('EA/BOX 판매 제품은 개별 중량(g)을 입력해 주세요.')
  if (unit === 'box' && !payload.carton_units) throw new Error('BOX 판매 제품은 카톤박스 입수량을 입력해 주세요.')
  const result = await client.from('sales_product_settings').upsert(payload, { onConflict: 'business_id,product_id' }).select('*').single()
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function saveClient(client: ReturnType<typeof createMoniServiceRoleClient>, id: string, data: Record<string, unknown>) {
  const cleaned = cleanClient(data)
  if (!cleaned.row.company_name) throw new Error('거래처명을 입력해 주세요.')
  let row: Record<string, unknown>
  if (id) {
    const result = await client.from('sales_clients').update(cleaned.row).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
    if (result.error) throw new Error(result.error.message)
    row = result.data
  } else {
    const result = await client.from('sales_clients').insert({ ...cleaned.row, business_id: BUSINESS_ID }).select('*').single()
    if (result.error) throw new Error(result.error.message)
    row = result.data
  }
  const validIds = await syncClientPeople(client, text(row.id), cleaned.assignedPersonIds)
  return { ...row, assigned_person_ids: validIds }
}

async function saveClientTerm(client: ReturnType<typeof createMoniServiceRoleClient>, data: Record<string, unknown>) {
  const clientId = text(data.client_id)
  const productId = text(data.product_id)
  if (!clientId || !productId) throw new Error('거래처와 제품을 선택해 주세요.')
  const salesUnit = normalizedUnit(data.sales_unit)
  const settingResult = await client.from('sales_product_settings').select('*').eq('business_id', BUSINESS_ID).eq('product_id', productId).single()
  if (settingResult.error) throw new Error('제품 판매설정을 먼저 완료해 주세요.')
  if (!settingResult.data.is_sellable) throw new Error('현재 판매 중지된 제품입니다.')
  if ((salesUnit === 'ea' || salesUnit === 'box') && num(settingResult.data.unit_weight_g) <= 0) throw new Error('제품 판매설정에 개별 중량(g)이 필요합니다.')
  if (salesUnit === 'box' && num(settingResult.data.carton_units) <= 0) throw new Error('제품 판매설정에 카톤박스 입수량이 필요합니다.')

  const termResult = await client.from('sales_client_product_terms').upsert({
    business_id: BUSINESS_ID,
    client_id: clientId,
    product_id: productId,
    active: data.active !== false,
    sales_unit: salesUnit,
    unit_price: Math.max(0, money(data.unit_price)),
    moq_quantity: Math.max(0, roundKg(data.moq_quantity)),
    note: text(data.note) || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id,product_id' }).select('*').single()
  if (termResult.error) throw new Error(termResult.error.message)

  const termId = text(termResult.data.id)
  const removed = await client.from('sales_client_product_agents').delete().eq('term_id', termId)
  if (removed.error) throw new Error(removed.error.message)

  const rawRates = Array.isArray(data.agent_rates) ? data.agent_rates : []
  const assignedResult = await client.from('sales_client_people').select('person_id').eq('client_id', clientId).eq('active', true)
  if (assignedResult.error) throw new Error(assignedResult.error.message)
  const assigned = new Set((assignedResult.data ?? []).map((row) => text(row.person_id)))
  const rates = rawRates
    .map((raw) => raw as Record<string, unknown>)
    .map((raw) => ({ person_id: text(raw.person_id), settlement_rate_per_kg: Math.max(0, money(raw.settlement_rate_per_kg)) }))
    .filter((row) => row.person_id && assigned.has(row.person_id) && row.settlement_rate_per_kg > 0)
  if (rates.length) {
    const inserted = await client.from('sales_client_product_agents').insert(rates.map((row) => ({ ...row, term_id: termId })))
    if (inserted.error) throw new Error(inserted.error.message)
  }
  return termResult.data
}

async function prepareOrderItems(
  client: ReturnType<typeof createMoniServiceRoleClient>,
  clientId: string,
  rawItems: unknown,
) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new Error('판매 품목을 한 개 이상 입력해 주세요.')
  const productIds = Array.from(new Set(rawItems.map((raw) => text((raw as Record<string, unknown>)?.product_id)).filter(Boolean)))
  if (!productIds.length) throw new Error('판매 제품을 선택해 주세요.')
  const [productsResult, settingsResult, termsResult] = await Promise.all([
    client.from('products').select('id,product_name,product_spec').in('id', productIds),
    client.from('sales_product_settings').select('*').eq('business_id', BUSINESS_ID).in('product_id', productIds),
    client.from('sales_client_product_terms').select('*').eq('client_id', clientId).eq('active', true).in('product_id', productIds),
  ])
  const failed = [productsResult, settingsResult, termsResult].find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)
  const productById = new Map((productsResult.data ?? []).map((row) => [text(row.id), row]))
  const settingById = new Map((settingsResult.data ?? []).map((row) => [text(row.product_id), row]))
  const termById = new Map((termsResult.data ?? []).map((row) => [text(row.product_id), row]))

  return rawItems.map((raw, index) => {
    const source = (raw ?? {}) as Record<string, unknown>
    const productId = text(source.product_id)
    const product = productById.get(productId)
    const setting = settingById.get(productId)
    const term = termById.get(productId)
    if (!product || !setting) throw new Error(`${index + 1}번째 제품의 판매설정을 확인해 주세요.`)
    if (!setting.is_sellable) throw new Error(`${text(product.product_name)}은(는) 판매 중지 상태입니다.`)
    if (!term) throw new Error(`${text(product.product_name)}의 거래처별 판매조건을 먼저 설정해 주세요.`)
    const quantity = num(source.quantity)
    if (quantity <= 0) throw new Error(`${index + 1}번째 품목의 수량을 확인해 주세요.`)
    const unit = normalizedUnit(source.unit, normalizedUnit(term.sales_unit))
    const unitPrice = source.unit_price === undefined || source.unit_price === null || source.unit_price === ''
      ? money(term.unit_price)
      : money(source.unit_price)
    if (unitPrice < 0) throw new Error(`${index + 1}번째 품목의 판매단가를 확인해 주세요.`)
    const kg = quantityKg(quantity, unit, setting)
    return {
      product_id: productId,
      product_name: text(product.product_name),
      specification: text(source.specification) || text(product.product_spec) || null,
      quantity,
      unit,
      unit_price: unitPrice,
      supply_amount: money(quantity * unitPrice),
      quantity_kg: kg,
      sort_order: index,
      term_id: text(term.id),
    }
  })
}

async function createSettlementSnapshots(
  client: ReturnType<typeof createMoniServiceRoleClient>,
  order: Record<string, unknown>,
  insertedItems: Array<Record<string, unknown>>,
  preparedItems: Array<Record<string, unknown>>,
) {
  const termIds = Array.from(new Set(preparedItems.map((row) => text(row.term_id)).filter(Boolean)))
  if (!termIds.length) return
  const agentsResult = await client.from('sales_client_product_agents').select('*').in('term_id', termIds)
  if (agentsResult.error) throw new Error(agentsResult.error.message)
  const personIds = Array.from(new Set((agentsResult.data ?? []).map((row) => text(row.person_id)).filter(Boolean)))
  const peopleResult = personIds.length
    ? await client.from('business_people').select('id,name').in('id', personIds)
    : { data: [], error: null }
  if (peopleResult.error) throw new Error(peopleResult.error.message)
  const personById = new Map((peopleResult.data ?? []).map((row) => [text(row.id), text(row.name)]))
  const agentsByTerm = new Map<string, Record<string, unknown>[]>()
  for (const row of agentsResult.data ?? []) {
    const key = text(row.term_id)
    agentsByTerm.set(key, [...(agentsByTerm.get(key) ?? []), row])
  }

  const rows: Record<string, unknown>[] = []
  preparedItems.forEach((item, index) => {
    const inserted = insertedItems[index]
    for (const agent of agentsByTerm.get(text(item.term_id)) ?? []) {
      const rate = money(agent.settlement_rate_per_kg)
      const kg = roundKg(item.quantity_kg)
      rows.push({
        business_id: BUSINESS_ID,
        order_id: order.id,
        order_item_id: inserted.id,
        client_id: order.client_id,
        product_id: item.product_id,
        person_id: agent.person_id,
        person_name: personById.get(text(agent.person_id)) || '영업 프리랜서',
        sale_date: order.sale_date,
        quantity_kg: kg,
        settlement_rate_per_kg: rate,
        settlement_amount: money(kg * rate),
      })
    }
  })
  if (rows.length) {
    const inserted = await client.from('sales_order_item_settlements').insert(rows)
    if (inserted.error) throw new Error(inserted.error.message)
  }
}

async function saveOrder(client: ReturnType<typeof createMoniServiceRoleClient>, id: string, data: Record<string, unknown>) {
  const saleDate = text(data.sale_date) || todayKst()
  const clientId = text(data.client_id)
  if (!validDate(saleDate)) throw new Error('판매일자를 확인해 주세요.')
  if (!clientId) throw new Error('거래처를 선택해 주세요.')
  const preparedItems = await prepareOrderItems(client, clientId, data.items)
  const supplyAmount = money(preparedItems.reduce((sum, item) => sum + num(item.supply_amount), 0))
  const vatRate = Math.max(0, Math.min(100, num(data.vat_rate)))
  const vatAmount = money(supplyAmount * vatRate / 100)
  const totalAmount = money(supplyAmount + vatAmount)
  const status = text(data.status) === 'draft' ? 'draft' : 'confirmed'
  const paymentStatus = ['unpaid', 'partial', 'paid'].includes(text(data.payment_status)) ? text(data.payment_status) : 'unpaid'

  const peopleResult = await client.from('sales_client_people').select('person_id,is_primary').eq('client_id', clientId).eq('active', true).order('is_primary', { ascending: false }).limit(1)
  if (peopleResult.error) throw new Error(peopleResult.error.message)
  const primaryPersonId = text(peopleResult.data?.[0]?.person_id) || null

  let order: Record<string, unknown>
  if (id) {
    const snapshotOrder = await client.from('sales_orders').select('*').eq('id', id).eq('business_id', BUSINESS_ID).single()
    const snapshotItems = await client.from('sales_order_items').select('*').eq('order_id', id).order('sort_order')
    if (snapshotOrder.error) throw new Error(snapshotOrder.error.message)
    if (snapshotItems.error) throw new Error(snapshotItems.error.message)
    const history = await client.from('sales_order_history').insert({ order_id: id, action: 'update-v2', snapshot: { order: snapshotOrder.data, items: snapshotItems.data ?? [] } })
    if (history.error) throw new Error(history.error.message)

    const update = await client.from('sales_orders').update({
      sale_date: saleDate,
      client_id: clientId,
      assigned_person_id: primaryPersonId,
      status,
      payment_status: paymentStatus,
      vat_rate: vatRate,
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      note: text(data.note) || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
    if (update.error) throw new Error(update.error.message)
    order = update.data
    const removed = await client.from('sales_order_items').delete().eq('order_id', id)
    if (removed.error) throw new Error(removed.error.message)
  } else {
    const statementNumber = await nextStatementNumber(client, saleDate)
    const insert = await client.from('sales_orders').insert({
      business_id: BUSINESS_ID,
      statement_number: statementNumber,
      sale_date: saleDate,
      client_id: clientId,
      assigned_person_id: primaryPersonId,
      status,
      payment_status: paymentStatus,
      vat_rate: vatRate,
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      note: text(data.note) || null,
      updated_at: new Date().toISOString(),
    }).select('*').single()
    if (insert.error) throw new Error(insert.error.message)
    order = insert.data
  }

  const itemInsert = await client.from('sales_order_items').insert(preparedItems.map(({ term_id: _termId, ...item }) => ({ ...item, order_id: order.id }))).select('*')
  if (itemInsert.error) {
    if (!id) await client.from('sales_orders').delete().eq('id', order.id)
    throw new Error(itemInsert.error.message)
  }
  await createSettlementSnapshots(client, order, itemInsert.data ?? [], preparedItems)
  return { ...order, items: itemInsert.data ?? [] }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const data = await loadData(createMoniServiceRoleClient(), request.nextUrl.searchParams.get('month'))
    return NextResponse.json({ ok: true, ...data })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '판매관리 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })
    const action = text(body.action)
    const data = (body.data ?? {}) as Record<string, unknown>
    const id = text(body.id)
    const client = createMoniServiceRoleClient()

    if (action === 'save_product_setting') return NextResponse.json({ ok: true, row: await saveProductSetting(client, data) })
    if (action === 'save_client') return NextResponse.json({ ok: true, row: await saveClient(client, id, data) })
    if (action === 'save_client_term') return NextResponse.json({ ok: true, row: await saveClientTerm(client, data) })
    if (action === 'save_order') return NextResponse.json({ ok: true, order: await saveOrder(client, id, data) })

    if (action === 'cancel_order') {
      if (!id) throw new Error('판매건 ID가 필요합니다.')
      const snapshotOrder = await client.from('sales_orders').select('*').eq('id', id).eq('business_id', BUSINESS_ID).single()
      const snapshotItems = await client.from('sales_order_items').select('*').eq('order_id', id).order('sort_order')
      if (snapshotOrder.error) throw new Error(snapshotOrder.error.message)
      if (snapshotItems.error) throw new Error(snapshotItems.error.message)
      await client.from('sales_order_history').insert({ order_id: id, action: 'cancel-v2', snapshot: { order: snapshotOrder.data, items: snapshotItems.data ?? [] } })
      const result = await client.from('sales_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, order: result.data })
    }

    if (action === 'update_payment') {
      if (!id) throw new Error('판매건 ID가 필요합니다.')
      const paymentStatus = text(data.payment_status)
      if (!['unpaid', 'partial', 'paid'].includes(paymentStatus)) throw new Error('입금상태가 올바르지 않습니다.')
      const result = await client.from('sales_orders').update({ payment_status: paymentStatus, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, order: result.data })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 판매관리 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '판매관리 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}