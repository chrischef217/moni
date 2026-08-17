import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const ACTION_DOMAIN = 'raw_material_transaction'
const MAX_MATERIAL_OPTIONS = 120

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const numeric = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 10)) ? text(value, 10) : ''
const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\-_()[\]{}.,/\\]+/g, '').trim()

function factoryDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function parseDateHint(value: string) {
  const exact = value.match(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/)
  if (exact) return `${exact[1]}-${String(Number(exact[2])).padStart(2, '0')}-${String(Number(exact[3])).padStart(2, '0')}`
  if (/오늘|금일/.test(value)) return factoryDate()
  const md = value.match(/(1[0-2]|0?[1-9])\s*월\s*(3[01]|[12]?\d)\s*일/)
  if (md) return `${factoryDate().slice(0, 4)}-${String(Number(md[1])).padStart(2, '0')}-${String(Number(md[2])).padStart(2, '0')}`
  return ''
}

function parsePackCount(value: string) {
  const match = value.match(/(?:총\s*)?([\d,.]+)\s*(?:개|포|봉|통|말|박스|box|ea)(?=$|\s|[,.·/)\]])/i)
  const count = match ? numeric(match[1]) : null
  return count && count > 0 && Number.isInteger(count) ? count : null
}

function parseExplicitWeightG(value: string) {
  const unitEnd = '(?=$|\\s|[,.·/)\\]])'
  const preferred = value.match(new RegExp(`(?:총|전체|합계)\\s*(?:중량|무게|수량)?\\s*[:：]?\\s*([\\d,.]+)\\s*(kg|킬로그램|킬로|g|그램)${unitEnd}`, 'i'))
  const fallback = value.match(new RegExp(`([\\d,.]+)\\s*(kg|킬로그램|킬로|g|그램)${unitEnd}`, 'i'))
  const match = preferred || fallback
  if (!match) return null
  const amount = numeric(match[1])
  if (!amount || amount <= 0) return null
  const grams = /^(kg|킬로그램|킬로)$/i.test(match[2]) ? amount * 1000 : amount
  return Number.isInteger(grams) ? grams : null
}

function classifyRawMaterialMutation(userText: string, contextText: string, hasMaterialMatch: boolean) {
  const current = userText.replace(/\s+/g, ' ').trim()
  const rawContext = /(원재료|원료|부자재)/.test(current) || hasMaterialMatch || /(원재료|원료).*(입고|매입|수불)/.test(contextText)
  const create = /(?:입고|매입).*(?:등록|기록|잡아|잡아줘|입력|작성|처리|반영|해줘|해주세요|해 줘)|(?:등록|기록|입력|작성).*(?:입고|매입)|(?:입고|매입)\s*(?:해줘|해주세요|해 줘)/.test(current)
  const update = /(?:수정|변경|정정|고쳐|바꿔)/.test(current)
  const remove = /(?:삭제|지워|제거|없애)/.test(current)
  if (rawContext && remove) return 'DELETE' as const
  if (rawContext && update) return 'UPDATE' as const
  if (create) return 'CREATE' as const
  return null
}

function transactionQuantityG(row: any) {
  return Number(row?.quantity_g ?? row?.total_weight_g ?? 0) || 0
}

function formatG(value: unknown) {
  const grams = Number(value || 0)
  if (Math.abs(grams) >= 1000) return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(grams / 1000)}kg`
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(grams)}g`
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '인증이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

async function loadMaterials(supabase: ReturnType<typeof createMoniServiceRoleClient>) {
  const { data, error } = await supabase
    .from('raw_materials')
    .select('id,item_code,item_name,supplier,packing_weight_g,current_stock_g,unit_price_per_kg,is_active,is_stock_managed')
    .eq('business_id', BUSINESS_ID)
    .eq('is_active', true)
    .eq('is_stock_managed', true)
    .order('item_name', { ascending: true })
    .limit(1000)
  if (error) throw new Error(`원재료 마스터 조회 실패: ${error.message}`)
  return data ?? []
}

function findMaterialMention(materials: any[], content: string) {
  const normalizedContent = normalize(content)
  const ranked = materials
    .map((row) => ({ row, name: normalize(row.item_name), code: normalize(row.item_code || row.id) }))
    .filter((entry) => entry.name.length >= 2 && (normalizedContent.includes(entry.name) || (entry.code && normalizedContent.includes(entry.code))))
    .sort((a, b) => b.name.length - a.name.length)
  return ranked[0]?.row ?? null
}

async function supplierSuggestions(supabase: ReturnType<typeof createMoniServiceRoleClient>, material: any) {
  if (!material?.id) return [] as Array<{ name: string; count: number; last_date: string | null; source: string }>
  const { data } = await supabase
    .from('raw_material_transactions')
    .select('supplier,txn_date,created_at')
    .eq('business_id', BUSINESS_ID)
    .eq('item_code', material.id)
    .eq('txn_type', 'INBOUND')
    .not('supplier', 'is', null)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(80)

  const counts = new Map<string, { count: number; last_date: string | null }>()
  for (const row of data ?? []) {
    const name = text(row.supplier, 200)
    if (!name) continue
    const current = counts.get(name) || { count: 0, last_date: null }
    current.count += 1
    if (!current.last_date) current.last_date = text(row.txn_date, 10) || null
    counts.set(name, current)
  }
  for (const name of text(material.supplier, 400).split(',').map((part) => part.trim()).filter(Boolean)) {
    if (!counts.has(name)) counts.set(name, { count: 0, last_date: null })
  }
  return [...counts.entries()]
    .map(([name, meta]) => ({ name, ...meta, source: meta.count ? '최근 실제 입고 이력' : '원재료 마스터' }))
    .sort((a, b) => b.count - a.count || String(b.last_date || '').localeCompare(String(a.last_date || '')))
    .slice(0, 6)
}

async function latestThreadExchange(supabase: ReturnType<typeof createMoniServiceRoleClient>, threadId: string) {
  const { data, error } = await supabase
    .from('moni_ai_messages')
    .select('id,role,content,created_at')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(14)
  if (error) throw new Error(`대화 조회 실패: ${error.message}`)
  const chronological = [...(data ?? [])].reverse()
  let userIndex = -1
  for (let index = chronological.length - 1; index >= 0; index -= 1) {
    if (chronological[index]?.role === 'user') { userIndex = index; break }
  }
  if (userIndex < 0) return { latestUser: null, latestAssistant: null, contextText: '' }
  const latestUser = chronological[userIndex]
  const latestAssistant = chronological.slice(userIndex + 1).find((row) => row.role === 'assistant') || null
  const contextText = chronological.slice(Math.max(0, userIndex - 6)).map((row) => text(row.content, 3000)).join(' ')
  return { latestUser, latestAssistant, contextText }
}

async function loadSourceConfirmation(
  supabase: ReturnType<typeof createMoniServiceRoleClient>,
  session: { loginId: string },
  threadId: string,
  sourceUserMessageId: string,
) {
  const { data, error } = await supabase
    .from('moni_action_confirmations')
    .select('id,action_type,status,payload,preview_text,warnings,result_snapshot,error_message,expires_at,created_at,executed_at')
    .eq('business_id', BUSINESS_ID)
    .eq('action_domain', ACTION_DOMAIN)
    .eq('requested_by_login_id', session.loginId)
    .eq('source_client_id', `moni-web:${threadId}`)
    .order('created_at', { ascending: false })
    .limit(12)
  if (error) throw new Error(`승인 상태 조회 실패: ${error.message}`)
  return (data ?? []).find((row: any) => text(row?.payload?.source_user_message_id, 80) === sourceUserMessageId) || null
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!
  const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
  if (!uuidLike(threadId)) return NextResponse.json({ ok: false, error: '유효한 thread_id가 필요합니다.' }, { status: 400 })

  try {
    const supabase = createMoniServiceRoleClient()
    const { latestUser, latestAssistant, contextText } = await latestThreadExchange(supabase, threadId)
    if (!latestUser) return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })

    const existing = await loadSourceConfirmation(supabase, auth.session, threadId, String(latestUser.id))
    if (existing) {
      const status = text(existing.status, 30)
      if (status === 'PENDING') {
        return NextResponse.json({
          ok: true,
          card: {
            stage: 'confirmation',
            operation: existing.action_type,
            source_user_message_id: latestUser.id,
            confirmation_id: existing.id,
            preview_text: existing.preview_text,
            warnings: existing.warnings || [],
            expires_at: existing.expires_at,
          },
        }, { headers: { 'Cache-Control': 'no-store' } })
      }
      if (status === 'EXECUTED') {
        return NextResponse.json({
          ok: true,
          card: {
            stage: 'completed', operation: existing.action_type, source_user_message_id: latestUser.id,
            confirmation_id: existing.id, preview_text: existing.preview_text, result: existing.result_snapshot,
          },
        }, { headers: { 'Cache-Control': 'no-store' } })
      }
      if (status === 'FAILED') {
        return NextResponse.json({
          ok: true,
          card: {
            stage: 'failed', operation: existing.action_type, source_user_message_id: latestUser.id,
            confirmation_id: existing.id, preview_text: existing.preview_text, error: existing.error_message || '실행하지 못했습니다.',
          },
        }, { headers: { 'Cache-Control': 'no-store' } })
      }
    }

    const materials = await loadMaterials(supabase)
    const combined = [text(latestUser.content, 5000), text(latestAssistant?.content, 5000), contextText].join(' ')
    const matchedMaterial = findMaterialMention(materials, combined)
    const operation = classifyRawMaterialMutation(text(latestUser.content, 5000), contextText, Boolean(matchedMaterial))
    if (!operation) return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })

    const suggestions = await supplierSuggestions(supabase, matchedMaterial)
    const assistantText = text(latestAssistant?.content, 5000)
    const packCount = parsePackCount(assistantText) ?? parsePackCount(text(latestUser.content, 5000))
    const explicitWeightG = parseExplicitWeightG(assistantText) ?? parseExplicitWeightG(text(latestUser.content, 5000))
    const packingWeightG = Number(matchedMaterial?.packing_weight_g || 0) || null
    const inferredQuantityG = explicitWeightG || (packCount && packingWeightG ? packCount * packingWeightG : null)
    const txDate = parseDateHint(text(latestUser.content, 5000)) || factoryDate()

    let candidates: any[] = []
    if (operation === 'UPDATE' || operation === 'DELETE') {
      let query = supabase
        .from('raw_material_transactions')
        .select('id,item_code,item_name,raw_material_name,txn_type,quantity_g,total_weight_g,quantity_packs,packing_weight_g,unit_price,supplier,note,txn_date,transaction_date,production_record_id,source_purchase_id,created_at')
        .eq('business_id', BUSINESS_ID)
        .eq('txn_type', 'INBOUND')
        .order('txn_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30)
      if (matchedMaterial?.id) query = query.eq('item_code', matchedMaterial.id)
      const hintedDate = parseDateHint(text(latestUser.content, 5000))
      if (hintedDate) query = query.eq('txn_date', hintedDate)
      const { data, error } = await query
      if (error) throw new Error(`수정·삭제 후보 조회 실패: ${error.message}`)
      candidates = (data ?? []).map((row: any) => ({
        id: row.id,
        material_id: row.item_code,
        material_name: row.raw_material_name || row.item_name || row.item_code,
        tx_date: row.txn_date || row.transaction_date,
        quantity_g: transactionQuantityG(row),
        quantity_packs: row.quantity_packs,
        packing_weight_g: row.packing_weight_g,
        unit_price: row.unit_price,
        supplier: row.supplier,
        note: row.note,
        protected: Boolean(row.production_record_id || row.source_purchase_id),
        protected_reason: row.source_purchase_id ? '매입 원장 연결 기록' : row.production_record_id ? '생산 기록 연결' : null,
      }))
    }

    const options = materials.slice(0, MAX_MATERIAL_OPTIONS).map((row: any) => ({
      id: row.id,
      name: row.item_name,
      item_code: row.item_code,
      packing_weight_g: Number(row.packing_weight_g || 0) || null,
      current_stock_g: Number(row.current_stock_g || 0),
    }))
    if (matchedMaterial?.id) options.sort((a: any, b: any) => Number(b.id === matchedMaterial.id) - Number(a.id === matchedMaterial.id))

    return NextResponse.json({
      ok: true,
      card: {
        stage: 'draft',
        operation,
        source_user_message_id: latestUser.id,
        source_assistant_message_id: latestAssistant?.id || null,
        inferred_from: latestAssistant ? 'MONI 사진/대화 분석 + 실제 원재료 마스터' : '사용자 요청 + 실제 원재료 마스터',
        fields: {
          raw_material_id: matchedMaterial?.id || '',
          raw_material_name: matchedMaterial?.item_name || '',
          tx_date: txDate,
          quantity_g: inferredQuantityG || '',
          quantity_packs: packCount || '',
          packing_weight_g: packingWeightG || '',
          supplier: suggestions[0]?.name || text(matchedMaterial?.supplier, 200) || '',
          unit_price: '',
          note: '',
        },
        material_options: options,
        supplier_suggestions: suggestions,
        candidates,
        evidence_note: latestAssistant
          ? '사진에서 MONI가 읽어낸 내용은 후보값으로만 채웁니다. 실제 저장 전 카드에서 직접 확인·수정해야 합니다.'
          : '한 번에 필요한 값을 입력한 뒤 미리보기를 확인하고 확정합니다.',
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '업무 카드 준비에 실패했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!

  const body = (await request.json().catch(() => null)) as Record<string, any> | null
  if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
  const command = text(body.command, 30).toLowerCase()
  const threadId = text(body.thread_id, 80)
  if (!uuidLike(threadId)) return NextResponse.json({ ok: false, error: '유효한 thread_id가 필요합니다.' }, { status: 400 })
  const sourceClientId = `moni-web:${threadId}`
  const supabase = createMoniServiceRoleClient()

  if (command === 'execute') {
    const confirmationId = text(body.confirmation_id, 80)
    if (!uuidLike(confirmationId)) return NextResponse.json({ ok: false, error: '유효한 confirmation_id가 필요합니다.' }, { status: 400 })
    try {
      const { data: confirmation, error } = await supabase
        .from('moni_action_confirmations')
        .select('id,business_id,action_domain,status,requested_by_login_id,source_client_id,expires_at')
        .eq('id', confirmationId)
        .eq('business_id', BUSINESS_ID)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!confirmation || confirmation.action_domain !== ACTION_DOMAIN) throw new Error('원재료 승인 건을 찾을 수 없습니다.')
      if (confirmation.requested_by_login_id !== auth.session.loginId || confirmation.source_client_id !== sourceClientId) throw new Error('승인 건의 요청 주체가 일치하지 않습니다.')
      if (confirmation.status !== 'PENDING') throw new Error('이미 처리됐거나 실행할 수 없는 승인 건입니다.')
      if (Date.parse(String(confirmation.expires_at || '')) <= Date.now()) {
        await supabase.from('moni_action_confirmations').update({ status: 'EXPIRED', error_message: 'confirmation_expired' }).eq('id', confirmationId).eq('status', 'PENDING')
        throw new Error('승인 유효시간이 만료됐습니다. 다시 입력 내용을 확인해 주세요.')
      }

      const { data, error: rpcError } = await supabase.rpc('moni_execute_raw_material_transaction_action', {
        p_confirmation_id: confirmationId,
        p_user_confirmation_text: '모바일 업무 카드에서 확정 실행',
        p_actor_login_id: auth.session.loginId,
        p_source_client_id: sourceClientId,
      })
      if (rpcError) {
        await supabase.from('moni_action_confirmations').update({ status: 'FAILED', error_message: text(rpcError.message, 1800) }).eq('id', confirmationId).eq('status', 'PENDING')
        throw new Error(rpcError.message)
      }
      return NextResponse.json({ ok: true, result: data }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '실행에 실패했습니다.' }, { status: 400 })
    }
  }

  if (command !== 'prepare') return NextResponse.json({ ok: false, error: '지원하지 않는 카드 명령입니다.' }, { status: 400 })

  const operation = text(body.operation, 20).toUpperCase()
  if (!['CREATE', 'UPDATE', 'DELETE'].includes(operation)) return NextResponse.json({ ok: false, error: '지원하지 않는 작업입니다.' }, { status: 400 })
  const sourceUserMessageId = text(body.source_user_message_id, 80)
  if (!uuidLike(sourceUserMessageId)) return NextResponse.json({ ok: false, error: '원본 사용자 메시지를 확인할 수 없습니다.' }, { status: 400 })

  try {
    const { data: sourceMessage, error: messageError } = await supabase
      .from('moni_ai_messages')
      .select('id')
      .eq('id', sourceUserMessageId)
      .eq('thread_id', threadId)
      .eq('business_id', BUSINESS_ID)
      .eq('role', 'user')
      .maybeSingle()
    if (messageError) throw new Error(messageError.message)
    if (!sourceMessage) throw new Error('현재 대화의 원본 요청을 확인할 수 없습니다.')

    const fields = body.fields && typeof body.fields === 'object' ? body.fields : {}
    const warnings: string[] = []
    let payload: Record<string, unknown> = { source_user_message_id: sourceUserMessageId }
    let beforeSnapshot: Record<string, unknown> | null = null
    let previewText = ''

    if (operation === 'CREATE') {
      const rawMaterialId = text(fields.raw_material_id, 160)
      const quantityG = numeric(fields.quantity_g)
      const txDate = validDate(fields.tx_date) || factoryDate()
      const supplier = text(fields.supplier, 300)
      const unitPriceRaw = text(fields.unit_price, 50)
      const unitPrice = unitPriceRaw ? numeric(unitPriceRaw) : null
      const quantityPacksRaw = text(fields.quantity_packs, 50)
      const quantityPacks = quantityPacksRaw ? numeric(quantityPacksRaw) : null
      const packingWeightRaw = text(fields.packing_weight_g, 50)
      const packingWeightG = packingWeightRaw ? numeric(packingWeightRaw) : null
      if (!rawMaterialId) throw new Error('원재료를 선택해 주세요.')
      if (!quantityG || quantityG <= 0 || !Number.isInteger(quantityG)) throw new Error('총 입고량은 1g 단위의 양수로 입력해 주세요.')
      if (unitPrice !== null && (!Number.isInteger(unitPrice) || unitPrice < 0)) throw new Error('단가는 0 이상의 정수로 입력해 주세요.')
      if (quantityPacks !== null && (quantityPacks <= 0 || !Number.isInteger(quantityPacks))) throw new Error('포장 개수는 양의 정수로 입력해 주세요.')
      if (packingWeightG !== null && (packingWeightG <= 0 || !Number.isInteger(packingWeightG))) throw new Error('포장당 중량은 1g 단위의 양수로 입력해 주세요.')

      const { data: material, error } = await supabase
        .from('raw_materials')
        .select('id,item_name,current_stock_g,packing_weight_g,supplier,is_active,is_stock_managed')
        .eq('id', rawMaterialId).eq('business_id', BUSINESS_ID).eq('is_active', true).maybeSingle()
      if (error) throw new Error(error.message)
      if (!material) throw new Error('현재 두배 원재료 마스터에서 선택한 항목을 찾을 수 없습니다.')
      if (material.is_stock_managed !== true) throw new Error('재고관리 대상이 아닌 항목에는 직접 입고를 등록할 수 없습니다.')
      const stockBefore = Number(material.current_stock_g || 0)
      const suggestions = await supplierSuggestions(supabase, material)
      if (!supplier && suggestions[0]?.name) warnings.push(`최근 실제 입고 이력 기준 주 매입처 후보는 ${suggestions[0].name}입니다. 매입처를 비워둔 상태로도 저장할 수 있습니다.`)
      payload = {
        ...payload,
        raw_material_id: material.id,
        raw_material_name: material.item_name,
        quantity_g: quantityG,
        quantity_packs: quantityPacks,
        packing_weight_g: packingWeightG || Number(material.packing_weight_g || 0) || null,
        tx_date: txDate,
        supplier: supplier || null,
        unit_price: unitPrice,
        note: text(fields.note, 1200) || null,
      }
      beforeSnapshot = { material_id: material.id, material_name: material.item_name, current_stock_g: stockBefore }
      previewText = `[원재료 입고 등록] ${txDate} · ${material.item_name} · ${formatG(quantityG)} · 매입처 ${supplier || '미입력'} · 재고 ${formatG(stockBefore)} → ${formatG(stockBefore + quantityG)}`
    } else {
      const transactionId = text(body.transaction_id || fields.transaction_id, 200)
      if (!transactionId) throw new Error(`${operation === 'DELETE' ? '삭제' : '수정'}할 입고 기록을 선택해 주세요.`)
      const { data: tx, error } = await supabase
        .from('raw_material_transactions')
        .select('*')
        .eq('id', transactionId).eq('business_id', BUSINESS_ID).maybeSingle()
      if (error) throw new Error(error.message)
      if (!tx) throw new Error('선택한 입고 기록을 찾을 수 없습니다.')
      if (String(tx.txn_type || tx.transaction_type || '').toUpperCase() !== 'INBOUND') throw new Error('현재 카드에서는 원재료 입고 기록만 수정·삭제할 수 있습니다.')
      if (tx.production_record_id || tx.source_purchase_id) throw new Error('생산 또는 매입 원장과 연결된 기록은 원본 업무에서 수정·취소해야 합니다.')

      const materialId = text(tx.item_code, 160)
      const { data: material, error: materialError } = await supabase
        .from('raw_materials')
        .select('id,item_name,current_stock_g,packing_weight_g,is_stock_managed')
        .eq('id', materialId).eq('business_id', BUSINESS_ID).maybeSingle()
      if (materialError) throw new Error(materialError.message)
      if (!material) throw new Error('거래와 연결된 원재료 마스터를 찾을 수 없습니다.')
      const oldQuantityG = transactionQuantityG(tx)
      const stockBefore = Number(material.current_stock_g || 0)
      beforeSnapshot = { transaction: tx, material: { id: material.id, item_name: material.item_name, current_stock_g: stockBefore } }

      if (operation === 'DELETE') {
        if (stockBefore - oldQuantityG < 0) throw new Error('이 과거 입고 기록을 삭제하면 현재 재고가 음수가 됩니다. 후속 출고·소모 기록을 먼저 확인해 주세요.')
        payload = { ...payload, transaction_id: tx.id, raw_material_id: material.id }
        previewText = `[원재료 입고 삭제] ${tx.txn_date || tx.transaction_date} · ${material.item_name} · ${formatG(oldQuantityG)} · 매입처 ${text(tx.supplier, 200) || '미입력'} · 삭제 후 현재재고 ${formatG(stockBefore - oldQuantityG)}`
      } else {
        const quantityG = numeric(fields.quantity_g)
        const txDate = validDate(fields.tx_date) || text(tx.txn_date || tx.transaction_date, 10)
        const supplier = Object.prototype.hasOwnProperty.call(fields, 'supplier') ? text(fields.supplier, 300) : text(tx.supplier, 300)
        const note = Object.prototype.hasOwnProperty.call(fields, 'note') ? text(fields.note, 1200) : text(tx.note, 1200)
        const unitPriceRaw = Object.prototype.hasOwnProperty.call(fields, 'unit_price') ? text(fields.unit_price, 50) : text(tx.unit_price, 50)
        const unitPrice = unitPriceRaw ? numeric(unitPriceRaw) : null
        const quantityPacksRaw = Object.prototype.hasOwnProperty.call(fields, 'quantity_packs') ? text(fields.quantity_packs, 50) : text(tx.quantity_packs, 50)
        const quantityPacks = quantityPacksRaw ? numeric(quantityPacksRaw) : null
        const packingWeightRaw = Object.prototype.hasOwnProperty.call(fields, 'packing_weight_g') ? text(fields.packing_weight_g, 50) : text(tx.packing_weight_g, 50)
        const packingWeightG = packingWeightRaw ? numeric(packingWeightRaw) : null
        if (!quantityG || quantityG <= 0 || !Number.isInteger(quantityG)) throw new Error('수정할 총 입고량은 1g 단위의 양수로 입력해 주세요.')
        if (unitPrice !== null && (!Number.isInteger(unitPrice) || unitPrice < 0)) throw new Error('단가는 0 이상의 정수로 입력해 주세요.')
        if (stockBefore - oldQuantityG + quantityG < 0) throw new Error('수정 후 현재 재고가 음수가 됩니다. 후속 출고·소모 기록을 먼저 확인해 주세요.')
        payload = {
          ...payload,
          transaction_id: tx.id,
          raw_material_id: material.id,
          raw_material_name: material.item_name,
          quantity_g: quantityG,
          quantity_packs: quantityPacks,
          packing_weight_g: packingWeightG || Number(material.packing_weight_g || 0) || null,
          tx_date: txDate,
          supplier: supplier || null,
          unit_price: unitPrice,
          note: note || null,
        }
        previewText = `[원재료 입고 수정] ${tx.txn_date || tx.transaction_date} · ${material.item_name} · ${formatG(oldQuantityG)} → ${txDate} · ${formatG(quantityG)} · 매입처 ${supplier || '미입력'} · 수정 후 현재재고 ${formatG(stockBefore - oldQuantityG + quantityG)}`
      }
    }

    const { data: pending } = await supabase
      .from('moni_action_confirmations')
      .select('id,payload')
      .eq('business_id', BUSINESS_ID)
      .eq('action_domain', ACTION_DOMAIN)
      .eq('requested_by_login_id', auth.session.loginId)
      .eq('source_client_id', sourceClientId)
      .eq('status', 'PENDING')
      .limit(20)
    const obsoleteIds = (pending ?? []).filter((row: any) => text(row?.payload?.source_user_message_id, 80) === sourceUserMessageId).map((row: any) => row.id)
    if (obsoleteIds.length) await supabase.from('moni_action_confirmations').update({ status: 'CANCELLED' }).in('id', obsoleteIds).eq('status', 'PENDING')

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const { data: confirmation, error } = await supabase
      .from('moni_action_confirmations')
      .insert({
        business_id: BUSINESS_ID,
        action_domain: ACTION_DOMAIN,
        action_type: operation,
        target_id: null,
        payload,
        before_snapshot: beforeSnapshot,
        preview_text: previewText,
        warnings,
        status: 'PENDING',
        requested_by_login_id: auth.session.loginId,
        requested_by_role: auth.session.role,
        source_client_id: sourceClientId,
        expires_at: expiresAt,
      })
      .select('id,action_type,status,preview_text,warnings,expires_at')
      .single()
    if (error) throw new Error(`승인 미리보기 생성 실패: ${error.message}`)

    return NextResponse.json({ ok: true, confirmation }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '입력값 확인에 실패했습니다.' }, { status: 400 })
  }
}
