import { Buffer } from 'node:buffer'
import { Agent, run } from '@openai/agents'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { isRawMaterialPhotoInboundRequest } from '@/lib/moni/raw-material-photo-intent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const DEFAULT_MODEL = 'gpt-5'

const text = (value: unknown, max = 4000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const normalize = (value: unknown) => text(value, 500).normalize('NFKC').toLowerCase().replace(/[\s\-_()[\]{}.,/\\]+/g, '')
const modelName = () => text(process.env.OPENAI_MONI_MODEL, 100) || DEFAULT_MODEL
const formatKg = (grams: unknown) => `${(num(grams) / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}kg`
const formatWon = (value: unknown) => `${Math.round(num(value)).toLocaleString('ko-KR')}원`

function cleanPage(raw: any) {
  return {
    pathname: text(raw?.pathname, 300),
    search: text(raw?.search, 500),
    title: text(raw?.title, 160),
    headings: Array.isArray(raw?.headings) ? raw.headings.map((item: unknown) => text(item, 120)).filter(Boolean).slice(0, 6) : [],
  }
}

function normalizeAttachmentIds(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((item) => text(item, 80)).filter(Boolean))].slice(0, MAX_IMAGES)
}

function parseJsonObject(value: unknown): Record<string, any> | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const candidates = [raw, raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')]
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch { /* try next representation */ }
  }
  return null
}

function dateValue(value: unknown) {
  const raw = text(value, 30)
  if (!raw) return null
  const direct = raw.match(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/)
  if (!direct) return null
  const date = `${direct[1]}-${String(Number(direct[2])).padStart(2, '0')}-${String(Number(direct[3])).padStart(2, '0')}`
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date
}

function positiveInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function positiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function expiryKind(value: unknown) {
  const raw = text(value, 60).toUpperCase()
  if (!raw) return null
  if (/소비|USE[_\s-]*BY/.test(raw)) return '소비기한'
  if (/유통|BEST[_\s-]*BEFORE/.test(raw)) return '유통기한'
  if (/EXP|EXPIR/.test(raw)) return 'EXP'
  return null
}

async function loadRecentContext(db: ReturnType<typeof createMoniServiceRoleClient>, threadId: string) {
  const result = await db.from('moni_ai_messages')
    .select('role,content,created_at')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', threadId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(8)
  if (result.error) throw new Error(result.error.message)
  return [...(result.data ?? [])].reverse().map((row: any) => `${row.role === 'assistant' ? 'MONI' : '사용자'}: ${text(row.content, 1800)}`).join('\n')
}

async function loadMaterials(db: ReturnType<typeof createMoniServiceRoleClient>) {
  const result = await db.from('raw_materials')
    .select('id,item_code,item_name,supplier,packing_weight_g,unit_price_per_kg,box_quantity,spec,storage_type,shelf_life_days,is_stock_managed,is_active')
    .eq('business_id', BUSINESS_ID)
    .eq('is_active', true)
    .order('item_name')
    .limit(1000)
  if (result.error) throw new Error(`원재료 마스터 조회 실패: ${result.error.message}`)
  return result.data ?? []
}

async function loadAttachments(db: ReturnType<typeof createMoniServiceRoleClient>, threadId: string, ids: string[]) {
  const result = await db.from('moni_ai_attachments')
    .select('id,file_name,mime_type,size_bytes,storage_bucket,storage_path,message_id,metadata,created_at')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', threadId)
    .eq('upload_status', 'READY')
    .in('id', ids)
  if (result.error) throw new Error(result.error.message)
  const rows = result.data ?? []
  const byId = new Map(rows.map((row: any) => [String(row.id), row]))
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[]
  if (ordered.length !== ids.length) throw new Error('첨부한 사진 일부를 확인할 수 없습니다. 다시 첨부해 주세요.')
  return ordered
}

async function toImageContent(db: ReturnType<typeof createMoniServiceRoleClient>, rows: any[]) {
  const content: Record<string, unknown>[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const mimeType = text(row.mime_type, 100).toLowerCase()
    const sizeBytes = num(row.size_bytes)
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error(`${text(row.file_name, 180)}은 지원하지 않는 사진 형식입니다.`)
    if (sizeBytes <= 0 || sizeBytes > MAX_IMAGE_BYTES) throw new Error(`${text(row.file_name, 180)}은 10MB 이하 사진만 분석할 수 있습니다.`)
    const downloaded = await db.storage.from(text(row.storage_bucket, 120)).download(text(row.storage_path, 500))
    if (downloaded.error || !downloaded.data) throw new Error(`${text(row.file_name, 180)} 사진을 불러오지 못했습니다.`)
    const buffer = Buffer.from(await downloaded.data.arrayBuffer())
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`${text(row.file_name, 180)}은 10MB 이하 사진만 분석할 수 있습니다.`)
    content.push({ type: 'input_text', text: `[입고 증거 사진 ${index + 1}: ${text(row.file_name, 180)}]` })
    content.push({ type: 'input_image', image: `data:${mimeType};base64,${buffer.toString('base64')}`, detail: 'auto' })
  }
  return content
}

function exactMaterial(materials: any[], analysis: Record<string, any>) {
  const id = text(analysis.matched_material_id, 180)
  if (id) {
    const byId = materials.find((row: any) => String(row.id) === id || String(row.item_code || '') === id)
    if (byId) return byId
  }
  const name = normalize(analysis.matched_material_name)
  if (!name) return null
  const exact = materials.filter((row: any) => normalize(row.item_name) === name)
  return exact.length === 1 ? exact[0] : null
}

function visibleAnswer(analysis: Record<string, any>, material: any, attachmentCount: number) {
  const packCount = positiveInteger(analysis.package_count)
  const photoPackWeightG = positiveNumber(analysis.package_weight_g)
  const explicitTotalG = positiveNumber(analysis.total_weight_g)
  const computedTotalG = explicitTotalG || (packCount && photoPackWeightG ? packCount * photoPackWeightG : null)
  const expDate = dateValue(analysis.expiry_date)
  const expKind = expiryKind(analysis.expiry_kind)
  const confidence = Math.max(0, Math.min(1, Number(analysis.match_confidence ?? 0)))
  const countConfidence = Math.max(0, Math.min(1, Number(analysis.package_count_confidence ?? 0)))
  const masterPacking = positiveNumber(material?.packing_weight_g)
  const masterPrice = positiveNumber(material?.unit_price_per_kg)
  const warnings = Array.isArray(analysis.warnings) ? analysis.warnings.map((item: unknown) => text(item, 240)).filter(Boolean).slice(0, 5) : []
  if (material && photoPackWeightG && masterPacking && Math.round(photoPackWeightG) !== Math.round(masterPacking)) {
    warnings.unshift(`사진 표기 포장중량 ${formatKg(photoPackWeightG)}과 원재료 마스터 포장기준 ${formatKg(masterPacking)}이 다릅니다. 저장 전에 실제 입고 포장을 확인해야 합니다.`)
  }
  if (packCount && countConfidence < 0.75) warnings.unshift('사진에서 센 포장 개수의 확신도가 낮습니다. 저장 전에 실제 개수를 확인해 주세요.')
  if (!material) warnings.unshift('사진만으로 두배 원재료 마스터의 정확한 항목을 하나로 확정하지 못했습니다. 카드에서 원재료를 직접 선택해 주세요.')

  return [
    '사진을 실제 원재료 입고 증거로 분석했습니다. 아래 값은 **저장 전 확인이 필요한 후보값**이며, 사진에서 보이지 않는 값은 추측하지 않았습니다.',
    '',
    `- 원재료 마스터: ${material ? `**${text(material.item_name, 200)}** (${text(material.item_code || material.id, 180)})` : '**확인 필요**'}`,
    `- 사진 식별 근거: ${text(analysis.visible_product_text, 500) || '명확한 제품 표기 확인 불가'}`,
    `- 사진 포장수량: ${packCount ? `**${packCount}개**` : '**확인 불가**'}`,
    `- 사진 표기 포장중량: ${photoPackWeightG ? `**${formatKg(photoPackWeightG)} / 포장**` : '**확인 불가**'}`,
    `- 사진 총 입고량: ${computedTotalG ? `**${formatKg(computedTotalG)}**` : '**확인 불가**'}`,
    `- 기한 종류: ${expKind || '확인 불가'}`,
    `- 기한 날짜: ${expDate || '확인 불가'}`,
    material ? `- 마스터 포장기준: ${masterPacking ? formatKg(masterPacking) : '미등록'}` : '',
    material ? `- 마스터 기준단가: ${masterPrice ? formatWon(masterPrice) : '미등록'}` : '',
    material ? `- 마스터 매입처: ${text(material.supplier, 240) || '미등록'}` : '',
    `- 사진 근거: ${attachmentCount}장`,
    `- 마스터 일치 확신도: ${material ? `${Math.round(confidence * 100)}%` : '확정 안 함'}`,
    warnings.length ? '' : '',
    ...warnings.map((warning) => `- ⚠ ${warning}`),
    '',
    '원재료 입고 입력 카드를 열었습니다. **원재료·포장수량·포장중량·총 입고량·단가·기한을 확인한 뒤 `입력 내용 확인`을 눌러야 실제 저장 단계로 넘어갑니다.**',
  ].filter((line) => line !== '').join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ ok: false, error: '관리자만 원재료 입고 사진을 업무값으로 반영할 수 있습니다.' }, { status: 403 })

    const body = await request.json().catch(() => null) as Record<string, any> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const message = text(body.message, 6000)
    const attachmentIds = normalizeAttachmentIds(body.attachment_ids)
    const threadId = text(body.thread_id, 80)
    if (!message || !attachmentIds.length || !threadId) return NextResponse.json({ ok: false, error: '원재료 입고 요청과 첨부 사진이 필요합니다.' }, { status: 400 })

    const db = createMoniServiceRoleClient()
    const thread = await db.from('moni_ai_threads').select('*')
      .eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', session.loginId).eq('status', 'ACTIVE').maybeSingle()
    if (thread.error) throw new Error(thread.error.message)
    if (!thread.data) return NextResponse.json({ ok: false, error: 'MONI 대화방을 확인할 수 없습니다.' }, { status: 404 })

    const recentContext = await loadRecentContext(db, threadId)
    if (!isRawMaterialPhotoInboundRequest(message, recentContext)) {
      return NextResponse.json({ ok: false, code: 'NOT_RAW_MATERIAL_PHOTO_INBOUND', error: '원재료 입고 사진 요청이 아닙니다.' }, { status: 422 })
    }

    const running = await db.from('moni_ai_agent_runs').select('id').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('status', 'RUNNING').gte('started_at', new Date(Date.now() - 5 * 60_000).toISOString()).limit(1).maybeSingle()
    if (running.error) throw new Error(running.error.message)
    if (running.data) return NextResponse.json({ ok: false, code: 'MONI_BUSY', error: 'MONI가 이전 질문에 답변 중입니다. 답변이 끝난 뒤 다시 보내 주세요.' }, { status: 409 })

    const [materials, attachments] = await Promise.all([loadMaterials(db), loadAttachments(db, threadId, attachmentIds)])
    const page = cleanPage(body.page)
    const storedUserText = `${message}\n\n📷 사진 ${attachmentIds.length}장 첨부`
    const userMessage = await db.from('moni_ai_messages').insert({ business_id: BUSINESS_ID, thread_id: threadId, role: 'user', content: storedUserText, page_context: page }).select('id').single()
    if (userMessage.error) throw new Error(userMessage.error.message)
    const linked = await db.from('moni_ai_attachments').update({ message_id: userMessage.data.id, updated_at: new Date().toISOString() })
      .eq('business_id', BUSINESS_ID).eq('thread_id', threadId).in('id', attachmentIds)
    if (linked.error) throw new Error(linked.error.message)

    const masterForModel = materials.map((row: any) => ({
      id: row.id,
      code: row.item_code,
      name: row.item_name,
      supplier: row.supplier,
      packing_weight_g: row.packing_weight_g,
      box_quantity: row.box_quantity,
      spec: row.spec,
      shelf_life_days: row.shelf_life_days,
      stock_managed: row.is_stock_managed === true,
    }))
    const imageContent = await toImageContent(db, attachments)
    const instructions = `당신은 MONI의 원재료 입고 사진 판독기입니다. 사진에서 실제로 보이는 증거와 제공된 두배 원재료 마스터만 사용합니다. 보이지 않거나 흐린 값은 절대 추측하지 않습니다.

목표:
1) 포장/라벨의 제품명·브랜드·규격 글자를 읽고 제공된 원재료 마스터에서 정확히 대응되는 항목이 하나일 때만 matched_material_id/name을 선택합니다. 유사하지만 확정할 수 없으면 null입니다.
2) 사진에서 서로 구분 가능한 실제 포장 개수만 package_count로 셉니다. 가려짐/중첩 때문에 확실하지 않으면 null입니다.
3) 포장 하나에 적힌 중량만 package_weight_g로 기록합니다. 총중량이 별도 표기된 경우에만 total_weight_g를 기록합니다.
4) 소비기한/유통기한/EXP/BEST BEFORE/USE BY가 사진에 명확히 보일 때만 expiry_kind와 expiry_date(YYYY-MM-DD)를 기록합니다. 제조일자를 기한으로 바꾸지 않습니다.
5) 여러 사진은 같은 입고 건의 보완 증거일 수 있습니다. 추가 사진이 기한 라벨만 보여주고 최근 대화에서 원재료가 이미 확정되어 있으면 recent_context의 확정된 마스터를 이어서 사용할 수 있지만, 사진과 대화가 충돌하면 null로 둡니다.
6) unit price, supplier, packing master data는 사진으로 만들지 않습니다. 이 값들은 서버가 선택된 마스터에서 다시 조회합니다.

반드시 JSON 객체 하나만 출력하세요. 설명문/마크다운 금지.
{
  "matched_material_id": string|null,
  "matched_material_name": string|null,
  "match_confidence": number,
  "match_source": "photo"|"recent_context"|"none",
  "visible_product_text": string,
  "package_count": integer|null,
  "package_count_confidence": number,
  "package_weight_g": number|null,
  "total_weight_g": number|null,
  "expiry_kind": "소비기한"|"유통기한"|"EXP"|null,
  "expiry_date": "YYYY-MM-DD"|null,
  "expiry_raw_text": string|null,
  "lot_text": string|null,
  "warnings": string[]
}

[최근 대화]
${text(recentContext, 8000) || '없음'}

[두배 원재료 마스터 후보]
${JSON.stringify(masterForModel).slice(0, 24000)}`

    const analyzer = new Agent({
      name: 'MONI Raw Material Inbound Photo Analyzer',
      model: modelName(),
      modelSettings: { parallelToolCalls: false, reasoning: { effort: 'minimal' }, text: { verbosity: 'low' }, maxTokens: 900 },
      instructions,
    })
    const startedAt = Date.now()
    const result = await run(analyzer, [{ role: 'user', content: [{ type: 'input_text', text: message }, ...imageContent] }] as any, { maxTurns: 1 })
    const parsed = parseJsonObject(typeof result.finalOutput === 'string' ? result.finalOutput : JSON.stringify(result.finalOutput ?? {})) || {
      matched_material_id: null,
      matched_material_name: null,
      match_confidence: 0,
      visible_product_text: '',
      package_count: null,
      package_count_confidence: 0,
      package_weight_g: null,
      total_weight_g: null,
      expiry_kind: null,
      expiry_date: null,
      warnings: ['사진 분석 결과를 구조화하지 못했습니다. 카드에서 값을 직접 확인해 주세요.'],
    }
    const material = exactMaterial(materials, parsed)
    if (!material) {
      parsed.matched_material_id = null
      parsed.matched_material_name = null
      parsed.match_confidence = 0
    } else {
      parsed.matched_material_id = material.id
      parsed.matched_material_name = material.item_name
    }
    const answer = visibleAnswer(parsed, material, attachmentIds.length)
    const now = new Date().toISOString()

    const assistantMessage = await db.from('moni_ai_messages').insert({
      business_id: BUSINESS_ID,
      thread_id: threadId,
      role: 'assistant',
      content: answer,
      page_context: page,
      provider: 'openai',
      model: modelName(),
    }).select('id').single()
    if (assistantMessage.error) throw new Error(assistantMessage.error.message)

    await db.from('moni_ai_attachments').update({
      metadata: {
        analysis_kind: 'raw_material_inbound_photo',
        analysis: parsed,
        matched_material_id: material?.id || null,
        analyzed_at: now,
      },
      updated_at: now,
    }).eq('business_id', BUSINESS_ID).eq('thread_id', threadId).in('id', attachmentIds)

    const agentRun = await db.from('moni_ai_agent_runs').insert({
      business_id: BUSINESS_ID,
      thread_id: threadId,
      message_id: userMessage.data.id,
      provider: 'openai',
      model: modelName(),
      status: 'COMPLETED',
      validation_status: material ? 'VERIFIED' : 'NEEDS_REVIEW',
      prompt_version: 'MONI_RAW_MATERIAL_PHOTO_INBOUND_V1',
      step_count: 1,
      tool_call_count: 0,
      request_count: 1,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      latency_ms: Date.now() - startedAt,
      finished_at: now,
      usage: { requests: 1, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      metadata: {
        raw_material_photo_inbound: true,
        attachment_ids: attachmentIds,
        matched_material_id: material?.id || null,
        analysis: parsed,
        separate_turn_write_approval: true,
      },
    }).select('id').single()

    await db.from('moni_ai_threads').update({
      title: thread.data.title || message.replace(/\s+/g, ' ').slice(0, 80),
      current_page: page,
      updated_at: now,
      last_message_at: now,
    }).eq('id', threadId).eq('business_id', BUSINESS_ID)

    return NextResponse.json({
      ok: true,
      text: answer,
      provider: 'openai',
      model: modelName(),
      thread_id: threadId,
      assistant_message_id: assistantMessage.data.id,
      attachment_count: attachmentIds.length,
      image_context_count: attachmentIds.length,
      agent_runtime: 'MONI_RAW_MATERIAL_PHOTO_INBOUND_V1',
      agent_run_id: agentRun.data?.id || null,
      structured_action_card: true,
      domain: 'raw_material_inbound',
      operation: 'CREATE',
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[MONI_RAW_MATERIAL_PHOTO_INBOUND_ERROR]', error)
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '원재료 입고 사진을 분석하지 못했습니다.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
