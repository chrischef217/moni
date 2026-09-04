import { NextRequest, NextResponse } from 'next/server'
import { GET as legacyGET, POST as legacyPOST } from '@/app/api/moni/mobile-actions/route'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const ACTION_DOMAIN = 'raw_material_transaction'
const PHOTO_WORKFLOW_LOOKBACK_MS = 2 * 60 * 60 * 1000
const text = (value: unknown, max = 1500) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => { const parsed = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : 0 }
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const positive = (value: unknown) => { const parsed = num(value); return parsed > 0 ? parsed : null }
const positiveInteger = (value: unknown) => { const parsed = num(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null }

function factoryDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
function photoPackCount(value: string) {
  const match = value.match(/사진\s*포장수량\s*:\s*(?:\*\*)?([\d,]+)\s*개/i)
  const parsed = match ? Number(match[1].replace(/,/g, '')) : 0
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}
function gramsFromLabel(value: string, label: RegExp) {
  const match = value.match(new RegExp(`${label.source}\\s*:\\s*(?:\\*\\*)?([\\d,.]+)\\s*(kg|킬로그램|g|그램)`, 'i'))
  if (!match) return null
  const amount = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return /kg|킬로그램/i.test(match[2]) ? Math.round(amount * 1000) : Math.round(amount)
}
function expirationKind(value: string) { const match = value.match(/기한\s*종류\s*:\s*(소비기한|유통기한|EXP)/i); return match ? (match[1].toUpperCase() === 'EXP' ? 'EXP' : match[1]) : '' }
function expirationDate(value: string) { return value.match(/기한\s*날짜\s*:\s*(?:\*\*)?(20\d{2}-\d{2}-\d{2})/)?.[1] || '' }
function firstParsed<T>(texts: string[], parser: (value: string) => T | null | ''): T | null { for (const value of texts) { const parsed = parser(value); if (parsed !== null && parsed !== '') return parsed as T } return null }
function isPhotoInboundContinuation(value: unknown) {
  const current = text(value, 5000)
  return /(유통기한|소비기한|사용기한|기한|EXP|BEST\s*BEFORE|USE\s*BY|LOT)/i.test(current)
    ? /(반영|입력|등록|추가|적용|저장|확인|읽어|봐|체크|해줘|해주세요|해 줘)/.test(current)
    : /(사진|이미지|첨부).*(입고|반영|입력|등록|추가|저장)/.test(current)
}

async function recentAssistantTexts(db: ReturnType<typeof createMoniServiceRoleClient>, threadId: string) {
  const result = await db.from('moni_ai_messages').select('content,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(8)
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []).map((row: any) => text(row.content, 6000))
}
async function latestUserMessage(db: ReturnType<typeof createMoniServiceRoleClient>, threadId: string) {
  const result = await db.from('moni_ai_messages').select('id,content,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('role', 'user').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (result.error) throw new Error(result.error.message)
  return result.data || null
}

type PhotoWorkflow = {
  workflowId: string
  evidenceIds: string[]
  matchedMaterialId: string
  packCount: number | null
  packWeightG: number | null
  totalWeightG: number | null
  expirationKind: string
  expirationDate: string
}

async function latestPhotoWorkflow(db: ReturnType<typeof createMoniServiceRoleClient>, threadId: string): Promise<PhotoWorkflow | null> {
  const result = await db.from('moni_ai_attachments')
    .select('id,metadata,created_at')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', threadId)
    .eq('upload_status', 'READY')
    .gte('created_at', new Date(Date.now() - PHOTO_WORKFLOW_LOOKBACK_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(24)
  if (result.error) throw new Error(result.error.message)

  const rows = result.data ?? []
  const latestWithWorkflow = rows.find((row: any) => text(row?.metadata?.raw_material_inbound_workflow_id, 80))
  const workflowId = text(latestWithWorkflow?.metadata?.raw_material_inbound_workflow_id, 80)
  if (!workflowId) return null

  const workflowRows = rows.filter((row: any) => text(row?.metadata?.raw_material_inbound_workflow_id, 80) === workflowId)
  const analyses = workflowRows.map((row: any) => row?.metadata?.analysis && typeof row.metadata.analysis === 'object' ? row.metadata.analysis : {}).filter(Boolean)
  const firstValue = (key: string) => {
    for (const analysis of analyses) {
      const value = analysis?.[key]
      if (value !== null && value !== undefined && value !== '') return value
    }
    return null
  }
  let matchedMaterialId = ''
  for (const row of workflowRows) {
    matchedMaterialId = text(row?.metadata?.matched_material_id, 180) || text(row?.metadata?.analysis?.matched_material_id, 180)
    if (matchedMaterialId) break
  }

  const expKindRaw = text(firstValue('expiry_kind'), 30)
  const expKind = /소비/.test(expKindRaw) ? '소비기한' : /유통/.test(expKindRaw) ? '유통기한' : /^EXP$/i.test(expKindRaw) ? 'EXP' : ''
  const expDateRaw = text(firstValue('expiry_date'), 20)
  const expDate = /^20\d{2}-\d{2}-\d{2}$/.test(expDateRaw) ? expDateRaw : ''

  return {
    workflowId,
    evidenceIds: workflowRows.slice().reverse().map((row: any) => text(row.id, 80)).filter(uuidLike).slice(0, 8),
    matchedMaterialId,
    packCount: positiveInteger(firstValue('package_count')),
    packWeightG: positive(firstValue('package_weight_g')),
    totalWeightG: positive(firstValue('total_weight_g')),
    expirationKind: expKind,
    expirationDate: expDate,
  }
}

async function materialReference(db: ReturnType<typeof createMoniServiceRoleClient>, materialId: string) {
  if (!materialId) return { material: null as any, recentPrice: 0 }
  const materialResult = await db.from('raw_materials')
    .select('id,item_code,item_name,supplier,packing_weight_g,unit_price_per_kg,box_quantity,spec,storage_type,shelf_life_days,is_stock_managed,is_active')
    .eq('business_id', BUSINESS_ID).eq('id', materialId).eq('is_active', true).maybeSingle()
  if (materialResult.error) throw new Error(materialResult.error.message)
  const material = materialResult.data
  if (!material || material.is_stock_managed !== true) return { material: null as any, recentPrice: 0 }
  const priceResult = await db.from('raw_material_transactions').select('unit_price,txn_date,created_at').eq('business_id', BUSINESS_ID).eq('item_code', materialId).eq('txn_type', 'INBOUND').not('unit_price', 'is', null).order('txn_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return { material, recentPrice: priceResult.error ? 0 : num(priceResult.data?.unit_price) }
}

async function enrichOrContinueDraft(request: NextRequest, payload: any) {
  const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
  if (!uuidLike(threadId)) return payload
  const db = createMoniServiceRoleClient()
  const [assistantTexts, workflow, latestUser] = await Promise.all([recentAssistantTexts(db, threadId), latestPhotoWorkflow(db, threadId), latestUserMessage(db, threadId)])

  let card = payload?.card
  const canSynthesize = !card && workflow && latestUser && isPhotoInboundContinuation(latestUser.content)
  if (canSynthesize) {
    card = {
      stage: 'draft',
      operation: 'CREATE',
      source_user_message_id: latestUser.id,
      fields: { raw_material_id: workflow.matchedMaterialId || '', raw_material_name: '', tx_date: factoryDate(), quantity_g: '', quantity_packs: '', packing_weight_g: '', supplier: '', unit_price: '', note: '' },
      candidates: [],
      inferred_from: 'MONI 원재료 입고 사진 workflow + 실제 원재료 마스터',
    }
  }
  if (!card || card.stage !== 'draft' || card.operation !== 'CREATE') return payload

  const fallbackPackCount = firstParsed<number>(assistantTexts, photoPackCount)
  const fallbackPackWeight = firstParsed<number>(assistantTexts, (value) => gramsFromLabel(value, /사진\s*표기\s*포장중량/))
  const fallbackTotal = firstParsed<number>(assistantTexts, (value) => gramsFromLabel(value, /사진\s*총\s*입고량/))
  const fallbackExpKind = firstParsed<string>(assistantTexts, expirationKind)
  const fallbackExpDate = firstParsed<string>(assistantTexts, expirationDate)

  const materialId = text(card.fields?.raw_material_id, 180) || text(workflow?.matchedMaterialId, 180)
  const { material, recentPrice } = await materialReference(db, materialId)
  const masterPackingG = num(material?.packing_weight_g)
  const packCount = workflow?.packCount || fallbackPackCount
  const photoPackWeightG = workflow?.packWeightG || fallbackPackWeight
  const photoTotalG = workflow?.totalWeightG || fallbackTotal
  const chosenPackingG = photoPackWeightG || num(card.fields?.packing_weight_g) || masterPackingG || 0
  const calculatedTotalG = photoTotalG || (packCount && chosenPackingG ? packCount * chosenPackingG : num(card.fields?.quantity_g) || 0)
  const masterPrice = num(material?.unit_price_per_kg)
  const unitPrice = num(card.fields?.unit_price) || masterPrice || recentPrice || 0
  const expKind = workflow?.expirationKind || fallbackExpKind || ''
  const expDate = workflow?.expirationDate || fallbackExpDate || ''
  const evidenceIds = workflow?.evidenceIds || []
  const warnings: string[] = []
  if (photoPackWeightG && masterPackingG && Math.round(photoPackWeightG) !== Math.round(masterPackingG)) warnings.push('사진의 포장중량과 원재료 마스터 포장기준이 다릅니다. 실제 입고 포장을 확인해 주세요.')
  if (evidenceIds.length && !material) warnings.push('사진에서 원재료 마스터를 하나로 확정하지 못했습니다. 카드에서 원재료를 직접 선택해야 합니다.')
  if (evidenceIds.length && !packCount) warnings.push('사진에서 포장 개수를 확정하지 못했습니다. 실제 수량을 확인해 입력해 주세요.')

  const nextCard = { ...card,
    fields: {
      ...(card.fields || {}),
      raw_material_id: material?.id || materialId || '',
      raw_material_name: material?.item_name || text(card.fields?.raw_material_name, 300),
      tx_date: text(card.fields?.tx_date, 10) || factoryDate(),
      quantity_packs: packCount || card.fields?.quantity_packs || '',
      packing_weight_g: chosenPackingG || '',
      quantity_g: calculatedTotalG || '',
      supplier: text(card.fields?.supplier, 300) || text(material?.supplier, 300),
      unit_price: unitPrice || '',
      expiration_kind: expKind,
      expiration_date: expDate,
      evidence_attachment_ids: evidenceIds,
    },
    photo_evidence: {
      workflow_id: workflow?.workflowId || null,
      attachment_ids: evidenceIds,
      count: evidenceIds.length,
      expiration_kind: expKind || null,
      expiration_date: expDate || null,
      photo_pack_count: packCount,
      photo_pack_weight_g: photoPackWeightG,
      photo_total_weight_g: photoTotalG,
    },
    master_reference: material ? {
      id: material.id,
      item_code: material.item_code,
      item_name: material.item_name,
      supplier: material.supplier,
      packing_weight_g: masterPackingG || null,
      unit_price: masterPrice || recentPrice || null,
      unit_price_source: masterPrice ? '원재료 마스터 기준단가' : recentPrice ? '최근 정상 입고 단가' : null,
      box_quantity: material.box_quantity,
      spec: material.spec,
      storage_type: material.storage_type,
      shelf_life_days: material.shelf_life_days,
    } : null,
    photo_warnings: warnings,
    evidence_note: evidenceIds.length
      ? `같은 원재료 입고 workflow의 사진 ${evidenceIds.length}장을 증거로 연결했습니다. 제품·수량·포장중량·기한은 사진 판독값과 원재료 마스터를 교차확인하고 저장 전 다시 확인합니다.`
      : card.evidence_note,
  }
  return { ...payload, card: nextCard }
}

export async function GET(request: NextRequest) {
  const response = await legacyGET(request)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
  try { return NextResponse.json(await enrichOrContinueDraft(request, payload), { status: response.status, headers: { 'Cache-Control': 'no-store' } }) }
  catch (error) { console.error('[MONI_MOBILE_RAW_PHOTO_CARD_ENRICH_ERROR]', error); return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } }) }
}

export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => null) as Record<string, any> | null
  const response = await legacyPOST(request)
  const payload = await response.json().catch(() => ({})) as any
  if (!body || !response.ok || !payload?.ok || text(body.command, 30).toLowerCase() !== 'prepare' || !payload?.confirmation?.id) return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } })

  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {}
  const expKind = text(fields.expiration_kind, 30)
  const expDate = text(fields.expiration_date, 10)
  const evidenceIds = Array.isArray(fields.evidence_attachment_ids) ? fields.evidence_attachment_ids.map((id: unknown) => text(id, 80)).filter(uuidLike).slice(0, 8) : []
  if (!expKind && !expDate && !evidenceIds.length) return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })

  try {
    const session = await getSessionFromRequest(request)
    if (!session || session.role !== 'admin') throw new Error('사진 근거를 승인 정보에 연결할 권한이 없습니다.')
    const db = createMoniServiceRoleClient()
    const confirmationId = text(payload.confirmation.id, 80)
    const row = await db.from('moni_action_confirmations').select('id,payload,preview_text,warnings,requested_by_login_id,status').eq('id', confirmationId).eq('business_id', BUSINESS_ID).eq('action_domain', ACTION_DOMAIN).maybeSingle()
    if (row.error) throw new Error(row.error.message)
    if (!row.data || row.data.requested_by_login_id !== session.loginId || row.data.status !== 'PENDING') throw new Error('사진 근거를 연결할 승인 건을 확인할 수 없습니다.')
    const nextPayload = { ...(row.data.payload || {}), expiration_kind: expKind || null, expiration_date: expDate || null, evidence_attachment_ids: evidenceIds }
    const extra = [expKind && expDate ? `${expKind} ${expDate}` : '', evidenceIds.length ? `사진근거 ${evidenceIds.length}장` : ''].filter(Boolean).join(' · ')
    const previewText = extra ? `${text(row.data.preview_text, 1800)} · ${extra}` : text(row.data.preview_text, 1800)
    const warnings = Array.isArray(row.data.warnings) ? [...row.data.warnings] : []
    if (expKind && !/^\d{4}-\d{2}-\d{2}$/.test(expDate)) warnings.push('기한 종류는 선택됐지만 날짜가 비어 있습니다. 실제 라벨 날짜를 확인해 주세요.')
    const updated = await db.from('moni_action_confirmations').update({ payload: nextPayload, preview_text: previewText, warnings }).eq('id', confirmationId).eq('status', 'PENDING').select('id,preview_text,warnings').single()
    if (updated.error) throw new Error(updated.error.message)
    payload.confirmation.preview_text = updated.data.preview_text
    payload.confirmation.warnings = updated.data.warnings
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '사진 근거를 승인 미리보기에 연결하지 못했습니다.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
}
