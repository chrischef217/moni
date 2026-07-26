import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROFILE_ID = 'default'
const DEFAULT_HS_CODE = '2103.90-9090'
const CURRENCIES = new Set(['USD', 'THB', 'KRW', 'EUR'])
const STATUSES = new Set(['DRAFT', 'GENERATED', 'SHIPPED', 'CANCELLED'])

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function integer(value: unknown) {
  const parsed = num(value)
  return parsed !== null && Number.isInteger(parsed) ? parsed : null
}

function bool(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = text(value).toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return fallback
}

function createId(prefix: string) {
  const stamp = Date.now().toString(36).toUpperCase()
  const random = Math.floor(Math.random() * 1_000_000).toString(36).toUpperCase().padStart(4, '0')
  return `${prefix}-${stamp}-${random}`
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function nextDocumentNumbers(documentDate: string) {
  const supabase = createMoniServiceRoleClient()
  const day = documentDate.replace(/-/g, '')
  const prefix = `INV-${day}-`
  const { data, error } = await supabase
    .from('export_documents')
    .select('invoice_no')
    .like('invoice_no', `${prefix}%`)
    .order('invoice_no', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message || '문서번호 생성에 실패했습니다.')
  const latest = text(data?.[0]?.invoice_no)
  const latestSequence = Number(latest.slice(prefix.length))
  const sequence = Number.isFinite(latestSequence) ? latestSequence + 1 : 1
  const serial = String(sequence).padStart(3, '0')
  return {
    invoice_no: `INV-${day}-${serial}`,
    packing_list_no: `PL-${day}-${serial}`,
  }
}

async function loadMetadata() {
  const supabase = createMoniServiceRoleClient()
  const [destinationResult, productResult, companyResult] = await Promise.all([
    supabase
      .from('export_destinations')
      .select('id, company_name, address, contact_name, phone, zip_code, country, created_at, updated_at')
      .order('company_name', { ascending: true }),
    supabase
      .from('export_product_settings')
      .select('id, product_id, english_name, hs_code, default_unit_price, currency, units_per_carton, net_weight_kg, gross_weight_kg, cbm, is_active, products!inner(id, product_name, product_code, report_number, product_spec, weight_g, is_active)')
      .eq('is_active', true)
      .order('english_name', { ascending: true }),
    supabase.from('company_profile').select('*').eq('id', PROFILE_ID).maybeSingle(),
  ])

  if (destinationResult.error) throw new Error(destinationResult.error.message)
  if (productResult.error) throw new Error(productResult.error.message)
  if (companyResult.error) throw new Error(companyResult.error.message)

  return {
    destinations: destinationResult.data ?? [],
    export_products: productResult.data ?? [],
    company_profile: companyResult.data ?? null,
  }
}

async function loadDocuments(id?: string) {
  const supabase = createMoniServiceRoleClient()
  let query = supabase
    .from('export_documents')
    .select('*, export_document_items(*)')
    .order('document_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (id) query = query.eq('id', id)
  const { data, error } = await query
  if (error) throw new Error(error.message || '수출서류 조회에 실패했습니다.')

  return (data ?? []).map((document: any) => ({
    ...document,
    export_document_items: [...(document.export_document_items ?? [])].sort((a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)),
  }))
}

async function buildDocumentPayload(body: Record<string, unknown>) {
  const documentDate = text(body.document_date)
  const consigneeId = text(body.consignee_id)
  const billTo = text(body.bill_to) || 'SAME AS CONSIGNEE'
  const status = text(body.status).toUpperCase() || 'DRAFT'
  const rawItems = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : []

  if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) return { error: 'Date를 입력해 주세요.' as const }
  if (!consigneeId) return { error: 'Consignee(수출처)를 선택해 주세요.' as const }
  if (!STATUSES.has(status) || status === 'SHIPPED' || status === 'CANCELLED') return { error: '저장 상태가 올바르지 않습니다.' as const }
  if (!rawItems.length) return { error: '수출 제품을 1개 이상 선택해 주세요.' as const }

  const settingIds = [...new Set(rawItems.map((item) => text(item.export_product_setting_id)).filter(Boolean))]
  if (settingIds.length !== rawItems.length) return { error: '수출 제품 선택값을 확인해 주세요.' as const }

  const supabase = createMoniServiceRoleClient()
  const [destinationResult, settingsResult, companyResult] = await Promise.all([
    supabase.from('export_destinations').select('*').eq('id', consigneeId).maybeSingle(),
    supabase
      .from('export_product_settings')
      .select('id, product_id, english_name, hs_code, default_unit_price, currency, units_per_carton, net_weight_kg, gross_weight_kg, cbm, is_active, products!inner(id, product_name, product_code, report_number, product_spec, weight_g, is_active)')
      .in('id', settingIds),
    supabase.from('company_profile').select('*').eq('id', PROFILE_ID).maybeSingle(),
  ])

  if (destinationResult.error) throw new Error(destinationResult.error.message)
  if (settingsResult.error) throw new Error(settingsResult.error.message)
  if (companyResult.error) throw new Error(companyResult.error.message)
  if (!destinationResult.data) return { error: '선택한 수출처를 찾을 수 없습니다.' as const }
  if (!companyResult.data) return { error: '관리자에서 회사 기본정보를 먼저 등록해 주세요.' as const }

  const settingMap = new Map((settingsResult.data ?? []).map((setting: any) => [text(setting.id), setting]))
  if (settingMap.size !== settingIds.length) return { error: '수출품목 설정에서 삭제되었거나 사용할 수 없는 제품이 포함되어 있습니다.' as const }

  const itemSnapshots: Array<Record<string, unknown>> = []
  for (let index = 0; index < rawItems.length; index += 1) {
    const raw = rawItems[index]
    const setting = settingMap.get(text(raw.export_product_setting_id)) as any
    if (!setting || setting.is_active === false) return { error: '사용 중인 수출품목만 선택할 수 있습니다.' as const }

    const cartons = integer(raw.cartons)
    if (cartons === null || cartons < 1) return { error: `${setting.english_name || '제품'}의 수량(CTN)을 1 이상 입력해 주세요.` as const }

    const currency = text(setting.currency).toUpperCase()
    if (!CURRENCIES.has(currency)) return { error: `${setting.english_name || '제품'}의 통화 설정을 확인해 주세요.` as const }

    const overridden = bool(raw.price_overridden, false)
    const basePrice = Number(setting.default_unit_price ?? 0)
    const requestedPrice = overridden ? num(raw.unit_price) : basePrice
    if (requestedPrice === null || requestedPrice < 0) return { error: `${setting.english_name || '제품'}의 Unit Price를 확인해 주세요.` as const }
    if (currency === 'KRW' && !Number.isInteger(requestedPrice)) return { error: 'KRW 단가는 소수점을 사용할 수 없습니다.' as const }

    const product = Array.isArray(setting.products) ? setting.products[0] : setting.products
    itemSnapshots.push({
      id: createId('EXPDOCITEM'),
      export_product_setting_id: text(setting.id),
      product_id: text(setting.product_id),
      product_name_ko: text(product?.product_name),
      product_name_en: text(setting.english_name),
      hs_code: text(setting.hs_code) || DEFAULT_HS_CODE,
      cartons,
      units_per_carton: Number(setting.units_per_carton ?? 0),
      unit_price: requestedPrice,
      currency,
      net_weight_per_carton_kg: Number(setting.net_weight_kg ?? 0),
      gross_weight_per_carton_kg: Number(setting.gross_weight_kg ?? 0),
      cbm_per_carton: Number(setting.cbm ?? 0),
      price_overridden: overridden,
      price_override_reason: overridden ? text(raw.price_override_reason) : '',
      sort_order: index,
    })
  }

  const document = {
    document_date: documentDate,
    consignee_id: consigneeId,
    exporter_snapshot: companyResult.data,
    consignee_snapshot: destinationResult.data,
    bill_to: billTo,
    port_of_loading: text(body.port_of_loading),
    final_destination: text(body.final_destination),
    vessel_flight: text(body.vessel_flight),
    sailing_date: text(body.sailing_date) || null,
    notify_party: text(body.notify_party),
    lc_enabled: bool(body.lc_enabled, false),
    lc_no: text(body.lc_no),
    lc_date: text(body.lc_date) || null,
    lc_issuing_bank: text(body.lc_issuing_bank),
    terms_delivery_payment: text(body.terms_delivery_payment),
    other_reference: text(body.other_reference),
    incoterm: text(body.incoterm).toUpperCase(),
    country_of_origin: text(body.country_of_origin) || 'Republic of Korea',
    reason_for_export: text(body.reason_for_export) || 'We ship the product for sale',
    status,
    updated_at: new Date().toISOString(),
  }

  return { document, itemSnapshots }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const id = text(request.nextUrl.searchParams.get('id'))
    const [documents, metadata] = await Promise.all([loadDocuments(id || undefined), loadMetadata()])
    if (id && !documents.length) return NextResponse.json({ ok: false, error: '수출서류를 찾을 수 없습니다.' }, { status: 404 })
    return NextResponse.json({ ok: true, documents, document: id ? documents[0] : null, ...metadata })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출서류 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const built = await buildDocumentPayload(body)
    if ('error' in built) return NextResponse.json({ ok: false, error: built.error }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const documentId = createId('EXPDOC')
      const numbers = await nextDocumentNumbers(built.document.document_date)
      const { error: documentError } = await supabase.from('export_documents').insert({ id: documentId, ...numbers, ...built.document })
      if (documentError?.code === '23505') continue
      if (documentError) throw new Error(documentError.message || '수출서류 저장에 실패했습니다.')

      const itemRows = built.itemSnapshots.map((item) => ({ ...item, document_id: documentId }))
      const { error: itemError } = await supabase.from('export_document_items').insert(itemRows)
      if (itemError) {
        await supabase.from('export_documents').delete().eq('id', documentId)
        throw new Error(itemError.message || '수출품목 저장에 실패했습니다.')
      }

      const documents = await loadDocuments(documentId)
      return NextResponse.json({ ok: true, document: documents[0] }, { status: 201 })
    }

    return NextResponse.json({ ok: false, error: '문서번호 생성 충돌이 발생했습니다. 다시 저장해 주세요.' }, { status: 409 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출서류 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const id = text(body.id)
    if (!id) return NextResponse.json({ ok: false, error: '수정할 수출서류 ID가 필요합니다.' }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { data: current, error: currentError } = await supabase.from('export_documents').select('id,status').eq('id', id).maybeSingle()
    if (currentError) throw new Error(currentError.message)
    if (!current) return NextResponse.json({ ok: false, error: '수출서류를 찾을 수 없습니다.' }, { status: 404 })

    const action = text(body.action).toUpperCase()
    if (action === 'SHIP') {
      if (current.status === 'CANCELLED') return NextResponse.json({ ok: false, error: '취소된 서류는 출고확정할 수 없습니다.' }, { status: 400 })
      const { error } = await supabase.from('export_documents').update({ status: 'SHIPPED', shipped_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(error.message || '출고확정에 실패했습니다.')
      return NextResponse.json({ ok: true, document: (await loadDocuments(id))[0] })
    }
    if (action === 'CANCEL') {
      const { error } = await supabase.from('export_documents').update({ status: 'CANCELLED', shipped_at: null, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(error.message || '수출서류 취소에 실패했습니다.')
      return NextResponse.json({ ok: true, document: (await loadDocuments(id))[0] })
    }

    if (current.status === 'SHIPPED') return NextResponse.json({ ok: false, error: '출고확정된 서류는 수정할 수 없습니다. 먼저 취소 처리해 주세요.' }, { status: 400 })
    if (current.status === 'CANCELLED') return NextResponse.json({ ok: false, error: '취소된 서류는 수정할 수 없습니다.' }, { status: 400 })

    const built = await buildDocumentPayload(body)
    if ('error' in built) return NextResponse.json({ ok: false, error: built.error }, { status: 400 })

    const { error: updateError } = await supabase.from('export_documents').update(built.document).eq('id', id)
    if (updateError) throw new Error(updateError.message || '수출서류 수정에 실패했습니다.')
    const { error: deleteItemError } = await supabase.from('export_document_items').delete().eq('document_id', id)
    if (deleteItemError) throw new Error(deleteItemError.message || '기존 수출품목 정리에 실패했습니다.')
    const itemRows = built.itemSnapshots.map((item) => ({ ...item, document_id: id }))
    const { error: insertItemError } = await supabase.from('export_document_items').insert(itemRows)
    if (insertItemError) throw new Error(insertItemError.message || '수출품목 수정에 실패했습니다.')

    return NextResponse.json({ ok: true, document: (await loadDocuments(id))[0] })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출서류 수정 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok: false, error: '삭제할 수출서류 ID가 필요합니다.' }, { status: 400 })
    const supabase = createMoniServiceRoleClient()
    const { data: current, error: currentError } = await supabase.from('export_documents').select('status').eq('id', id).maybeSingle()
    if (currentError) throw new Error(currentError.message)
    if (!current) return NextResponse.json({ ok: false, error: '수출서류를 찾을 수 없습니다.' }, { status: 404 })
    if (current.status === 'SHIPPED') return NextResponse.json({ ok: false, error: '출고확정된 서류는 삭제할 수 없습니다. 취소 처리 후 관리해 주세요.' }, { status: 400 })
    const { error } = await supabase.from('export_documents').delete().eq('id', id)
    if (error) throw new Error(error.message || '수출서류 삭제에 실패했습니다.')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출서류 삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
