import { NextRequest, NextResponse } from 'next/server'
import { GET as legacyGET, POST as legacyPOST } from '@/app/api/moni/mobile-actions/route'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const ACTION_DOMAIN = 'raw_material_transaction'
const text = (value: unknown, max = 1500) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => { const parsed = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : 0 }
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))

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

async function recentAssistantTexts(db: ReturnType<typeof createMoniServiceRoleClient>, threadId: string) {
  const result = await db.from('moni_ai_messages').select('content,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(8)
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []).map((row: any) => text(row.content, 6000))
}
async function latestPhotoEvidence(db: ReturnType<typeof createMoniServiceRoleClient>, threadId: string) {
  const message = await db.from('moni_ai_messages').select('id').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('role', 'user').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (message.error) throw new Error(message.error.message)
  if (!message.data?.id) return [] as string[]
  const attachments = await db.from('moni_ai_attachments').select('id').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('message_id', message.data.id).eq('upload_status', 'READY').order('created_at')
  if (attachments.error) throw new Error(attachments.error.message)
  return (attachments.data ?? []).map((row: any) => text(row.id, 80)).filter(Boolean)
}

async function enrichDraft(request: NextRequest, payload: any) {
  const card = payload?.card
  if (!card || card.stage !== 'draft' || card.operation !== 'CREATE') return payload
  const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
  if (!uuidLike(threadId)) return payload
  const db = createMoniServiceRoleClient()
  const [assistantTexts, evidenceIds] = await Promise.all([recentAssistantTexts(db, threadId), latestPhotoEvidence(db, threadId)])
  if (!assistantTexts.length && !evidenceIds.length) return payload

  const packCount = firstParsed<number>(assistantTexts, photoPackCount)
  const photoPackWeightG = firstParsed<number>(assistantTexts, (value) => gramsFromLabel(value, /사진\s*표기\s*포장중량/))
  const photoTotalG = firstParsed<number>(assistantTexts, (value) => gramsFromLabel(value, /사진\s*총\s*입고량/))
  const expKind = firstParsed<string>(assistantTexts, expirationKind)
  const expDate = firstParsed<string>(assistantTexts, expirationDate)
  const materialId = text(card.fields?.raw_material_id, 180)

  let material: any = null
  let recentPrice = 0
  if (materialId) {
    const materialResult = await db.from('raw_materials').select('id,item_code,item_name,supplier,packing_weight_g,unit_price_per_kg,box_quantity,spec,storage_type,shelf_life_days,is_stock_managed').eq('business_id', BUSINESS_ID).eq('id', materialId).maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message)
    material = materialResult.data
    const priceResult = await db.from('raw_material_transactions').select('unit_price,txn_date,created_at').eq('business_id', BUSINESS_ID).eq('item_code', materialId).eq('txn_type', 'INBOUND').not('unit_price', 'is', null).order('txn_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!priceResult.error) recentPrice = num(priceResult.data?.unit_price)
  }

  const masterPackingG = num(material?.packing_weight_g)
  const chosenPackingG = photoPackWeightG || num(card.fields?.packing_weight_g) || masterPackingG || 0
  const calculatedTotalG = photoTotalG || (packCount && chosenPackingG ? packCount * chosenPackingG : num(card.fields?.quantity_g) || 0)
  const masterPrice = num(material?.unit_price_per_kg)
  const unitPrice = num(card.fields?.unit_price) || masterPrice || recentPrice || 0
  const warnings: string[] = []
  if (photoPackWeightG && masterPackingG && Math.round(photoPackWeightG) !== Math.round(masterPackingG)) warnings.push('사진의 포장중량과 원재료 마스터 포장기준이 다릅니다. 실제 입고 포장을 확인해 주세요.')
  if (evidenceIds.length && !materialId) warnings.push('사진에서 원재료 마스터를 하나로 확정하지 못했습니다. 카드에서 원재료를 직접 선택해야 합니다.')
  if (evidenceIds.length && !packCount) warnings.push('사진에서 포장 개수를 확정하지 못했습니다. 실제 수량을 확인해 입력해 주세요.')

  return { ...payload, card: { ...card,
    fields: { ...(card.fields || {}), quantity_packs: packCount || card.fields?.quantity_packs || '', packing_weight_g: chosenPackingG || '', quantity_g: calculatedTotalG || '', unit_price: unitPrice || '', expiration_kind: expKind || '', expiration_date: expDate || '', evidence_attachment_ids: evidenceIds },
    photo_evidence: { attachment_ids: evidenceIds, count: evidenceIds.length, expiration_kind: expKind || null, expiration_date: expDate || null, photo_pack_count: packCount, photo_pack_weight_g: photoPackWeightG, photo_total_weight_g: photoTotalG },
    master_reference: material ? { id: material.id, item_code: material.item_code, item_name: material.item_name, supplier: material.supplier, packing_weight_g: masterPackingG || null, unit_price: masterPrice || recentPrice || null, unit_price_source: masterPrice ? '원재료 마스터 기준단가' : recentPrice ? '최근 정상 입고 단가' : null, box_quantity: material.box_quantity, spec: material.spec, storage_type: material.storage_type, shelf_life_days: material.shelf_life_days } : null,
    photo_warnings: warnings,
    evidence_note: evidenceIds.length ? `사진 ${evidenceIds.length}장을 입고 증거로 연결했습니다. 사진 판독값과 원재료 마스터 기준값을 함께 채웠으며 불일치는 저장 전에 직접 확인해야 합니다.` : card.evidence_note,
  } }
}

export async function GET(request: NextRequest) {
  const response = await legacyGET(request)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
  try { return NextResponse.json(await enrichDraft(request, payload), { status: response.status, headers: { 'Cache-Control': 'no-store' } }) }
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
