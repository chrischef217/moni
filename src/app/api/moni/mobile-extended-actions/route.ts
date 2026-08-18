import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileExtendedIntent, type MobileExtendedDomain, type MobileExtendedIntent } from '@/lib/moni/mobile-extended-intents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => { const parsed = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : 0 }
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 10)) ? text(value, 10) : ''
const normalize = (value: unknown) => text(value).normalize('NFKC').toLowerCase().replace(/[\s\-_()[\]{}.,/\\]+/g, '')

function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
function thisMonth() { return today().slice(0, 7) }
function option(value: unknown, label: unknown, sub = '') { return { value: text(value, 200), label: text(label, 300), sub: text(sub, 500) } }
function field(key: string, label: string, type: string, value: unknown = '', extra: Record<string, unknown> = {}) { return { key, label, type, value, ...extra } }
function firstMention<T extends Record<string, any>>(rows: T[], value: string, keys: string[]) {
  const haystack = normalize(value)
  return rows.map((row) => ({ row, score: Math.max(...keys.map((key) => normalize(row[key]).length && haystack.includes(normalize(row[key])) ? normalize(row[key]).length : 0)) }))
    .filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score)[0]?.row || null
}
function semanticAction(intent: MobileExtendedIntent) {
  if (['CREATE', 'RECEIVE', 'ADJUST'].includes(intent.operation)) return 'CREATE'
  if (intent.operation === 'DELETE') return 'DELETE'
  return 'UPDATE'
}
function actionDomain(domain: MobileExtendedDomain) { return `mobile_pc_form_${domain}` }

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

async function latestExchange(threadId: string, loginId: string) {
  const db = createMoniServiceRoleClient()
  const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', loginId).eq('status', 'ACTIVE').maybeSingle()
  if (thread.error) throw new Error(thread.error.message)
  if (!thread.data) throw new Error('현재 MONI 대화방을 확인할 수 없습니다.')
  const messages = await db.from('moni_ai_messages').select('id,role,content,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).order('created_at', { ascending: false }).limit(18)
  if (messages.error) throw new Error(messages.error.message)
  const rows = [...(messages.data ?? [])].reverse()
  let index = -1
  for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i]?.role === 'user') { index = i; break }
  if (index < 0) return { user: null, assistant: null }
  return { user: rows[index], assistant: rows.slice(index + 1).find((row) => row.role === 'assistant') || null }
}

async function pcApi(request: NextRequest, path: string, method: string, body?: unknown) {
  const url = new URL(path, request.url)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const cookie = request.headers.get('cookie')
  if (cookie) headers.cookie = cookie
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
  const payload = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok || payload?.ok === false) throw new Error(text(payload?.error, 1800) || `${path} 처리 실패 (${response.status})`)
  return payload
}

async function catalogs() {
  const db = createMoniServiceRoleClient()
  const [products, units, recipes, raw, packaging, clients, people, opportunities, orders, receipts, variants, terms, sanitation, adjustments] = await Promise.all([
    db.from('products').select('*').eq('business_id', BUSINESS_ID).order('product_name'),
    db.from('product_production_units').select('*').eq('business_id', BUSINESS_ID).order('product_id').order('sort_order'),
    db.from('recipes').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).order('product_name').order('sort_order'),
    db.from('raw_materials').select('*').eq('business_id', BUSINESS_ID).order('item_name'),
    db.from('packaging_materials').select('*').eq('business_id', BUSINESS_ID).order('material_name'),
    db.from('sales_clients').select('*').eq('business_id', BUSINESS_ID).order('company_name'),
    db.from('business_people').select('*').eq('business_id', BUSINESS_ID).order('name'),
    db.from('sales_opportunities').select('*').eq('business_id', BUSINESS_ID).order('created_at', { ascending: false }).limit(150),
    db.from('sales_orders').select('id,statement_number,sale_date,client_id,status,total_amount,due_date,payment_status').eq('business_id', BUSINESS_ID).order('sale_date', { ascending: false }).limit(150),
    db.from('sales_receipts').select('*').eq('business_id', BUSINESS_ID).order('receipt_date', { ascending: false }).limit(150),
    db.from('sales_product_variants').select('*').eq('business_id', BUSINESS_ID).order('product_id').order('sort_order'),
    db.from('sales_client_variant_terms').select('*').eq('business_id', BUSINESS_ID),
    db.from('sanitation_logs').select('*').eq('business_id', BUSINESS_ID).order('check_date', { ascending: false }).limit(100),
    db.from('finished_goods_inventory_adjustments').select('*').eq('business_id', BUSINESS_ID).order('adjustment_date', { ascending: false }).limit(100),
  ])
  const all = [products, units, recipes, raw, packaging, clients, people, opportunities, orders, receipts, variants, terms, sanitation, adjustments]
  const failed = all.find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)
  return {
    products: products.data ?? [], units: units.data ?? [], recipes: recipes.data ?? [], raw: raw.data ?? [], packaging: packaging.data ?? [],
    clients: clients.data ?? [], people: people.data ?? [], opportunities: opportunities.data ?? [], orders: orders.data ?? [], receipts: receipts.data ?? [],
    variants: variants.data ?? [], terms: terms.data ?? [], sanitation: sanitation.data ?? [], adjustments: adjustments.data ?? [],
  }
}

function candidate(id: unknown, label: unknown, values: Record<string, any>) { return { id: text(id, 200), label: text(label, 500), values } }
function active<T extends Record<string, any>>(rows: T[], key = 'is_active') { return rows.filter((row) => row[key] !== false && row.status !== 'inactive' && row.status !== 'INACTIVE') }

async function buildDraft(request: NextRequest, intent: MobileExtendedIntent, sourceUserId: string, userText: string) {
  const c = await catalogs()
  const products = active(c.products)
  const clients = active(c.clients, 'active')
  const people = active(c.people, 'active')
  const productOptions = products.map((row: any) => option(row.id, row.product_name, row.product_code || row.product_type || ''))
  const clientOptions = clients.map((row: any) => option(row.id, row.company_name, row.contact_name || row.phone || ''))
  const personOptions = people.map((row: any) => option(row.id, row.name, row.person_type || ''))
  const matchedProduct = firstMention(products as any[], userText, ['product_name', 'product_code', 'id'])
  const matchedClient = firstMention(clients as any[], userText, ['company_name'])
  const matchedPerson = firstMention(people as any[], userText, ['name'])
  const base = { stage: 'draft', domain: intent.domain, operation: intent.operation, source_user_message_id: sourceUserId, schema: [] as any[], candidates: [] as any[], warnings: [] as string[] }

  if (intent.domain === 'product_master') {
    return { ...base, title: '제품 마스터', schema: [
      field('product_name','제품명','text','',{required:true}), field('product_code','제품코드','text',''), field('report_number','품목보고번호','text',''),
      field('product_type','제품구분','select','완제품',{options:[option('완제품','완제품'),option('반제품','반제품')]}), field('food_type_name','식품유형','select','',{options:[option('소스','소스'),option('복합조미식품','복합조미식품'),option('기타가공품','기타가공품')]}),
      field('product_spec','제품규격','text',''), field('weight_g','중량(g)','number',''), field('storage_method','보관방법','text',''), field('storage_type','보관유형','text',''),
      field('shelf_life','소비기한 표시','text',''), field('shelf_life_days','소비기한(일)','number',''), field('shelf_life_standard','소비기한 기준','text',''),
      field('packaging_material','포장재','text',''), field('lot_rule','LOT 규칙','text',''), field('allergens','알레르기','text',''), field('is_active','활성','checkbox',true),
    ], candidates: c.products.map((row:any)=>candidate(row.id,`${row.product_name} · ${row.product_code || row.id}`,row)), defaults: matchedProduct || {} }
  }

  if (intent.domain === 'production_unit') {
    const unitCandidates = c.units.map((row:any)=>candidate(row.id,`${products.find((p:any)=>p.id===row.product_id)?.product_name || row.product_id} · ${row.unit_name} · ${num(row.unit_weight_g).toLocaleString('ko-KR')}g`,row))
    return { ...base, title:'생산단위', schema:[field('product_id','제품','select',matchedProduct?.id || '',{required:true,options:productOptions}),field('unit_name','단위명','text','',{required:true}),field('unit_weight_g','단위중량(g)','number','',{required:true}),field('is_default','기본단위','checkbox',false),field('sort_order','정렬순서','number','0')], candidates:unitCandidates }
  }

  if (intent.domain === 'recipe') {
    const recipeCandidates = c.recipes.map((row:any)=>candidate(row.id,`${row.product_name} · ${row.food_type_name} · ${num(row.ratio_percent)}%`,row))
    return { ...base, title:'레시피 항목', schema:[field('product_id','제품','select',matchedProduct?.id || '',{required:true,options:productOptions}),field('food_type_name','식품유형/항목명','text','',{required:true}),field('ratio_percent','배합비율(%)','number','',{required:true,step:'0.01'}),field('ingredient_type','재료유형','select','원재료',{options:[option('원재료','원재료'),option('반제품','반제품'),option('기타','기타')]}),field('sort_order','정렬순서','number','0')], candidates:recipeCandidates, warnings:['레시피 수정 시 해당 제품의 전체 배합비율 합계가 100.00%인지 PC API가 다시 검증합니다.'] }
  }

  if (intent.domain === 'raw_material_master') {
    const semi = products.filter((row:any)=>row.product_type==='반제품').map((row:any)=>option(row.id,row.product_name,row.product_code||''))
    return { ...base, title:'원재료 마스터', schema:[field('item_name','원재료명','text','',{required:true}),field('ingredient_type','재료유형','select','원재료',{options:[option('원재료','원재료'),option('반제품','반제품'),option('제품/반제품','제품/반제품'),option('기타','기타')]}),field('linked_product_id','연결 반제품','select','',{options:[option('','없음'),...semi]}),field('food_type','식품유형','text',''),field('country_of_origin','원산지','text',''),field('spec','규격','text',''),field('storage_type','보관유형','text',''),field('shelf_life_days','소비기한(일)','number',''),field('supplier','매입처','text',''),field('supplier_contact','매입처 연락처','text',''),field('supplier_address','매입처 주소','text',''),field('supplier_biz_number','사업자번호','text',''),field('packing_weight_g','단위(g)','number','',{required:true}),field('is_active','활성','checkbox',true)], candidates:c.raw.map((row:any)=>candidate(row.id,`${row.item_name} · ${row.item_code || row.id}`,row)) }
  }

  if (intent.domain === 'packaging_master') {
    return { ...base, title:'부재료 마스터', schema:[field('material_name','부재료명','text','',{required:true}),field('ingredient_type','재료유형','select','부재료',{options:[option('부재료','부재료'),option('기타','기타')]}),field('material_code','코드','text',''),field('spec','규격','text',''),field('material_type','유형','text',''),field('supplier','매입처','text',''),field('current_stock','현재재고(EA)','number','0'),field('unit_price','단가','number','0'),field('is_active','활성','checkbox',true)], candidates:c.packaging.map((row:any)=>candidate(row.id,`${row.material_name} · ${row.material_code || row.id}`,row)) }
  }

  if (intent.domain === 'sanitation') {
    return { ...base, title:'위생점검 일지', schema:[field('check_date','점검일','date',today(),{required:true}),field('checker_name','점검자','text','',{required:true}),field('workplace_clean','작업장 청결','checkbox',true),field('workplace_note','작업장 비고','text',''),field('worker_hygiene','작업자 위생','checkbox',true),field('worker_note','작업자 비고','text',''),field('material_storage','원료 보관','checkbox',true),field('material_note','원료 비고','text',''),field('equipment_clean','설비 청결','checkbox',true),field('equipment_note','설비 비고','text',''),field('pest_control','방충·방서','checkbox',true),field('pest_note','방충 비고','text',''),field('water_hygiene','용수 위생','checkbox',true),field('water_note','용수 비고','text',''),field('overall_result','종합결과','select','적합',{options:[option('적합','적합'),option('부적합','부적합')]}),field('action_taken','조치사항','textarea','')], candidates:[] }
  }

  if (intent.domain === 'finished_goods_adjustment') {
    const inventory = await pcApi(request, '/api/moni/finished-goods-inventory', 'GET')
    const inventoryRows = Array.isArray(inventory.inventory) ? inventory.inventory : []
    const invOptions = inventoryRows.map((row:any)=>option(row.product_id,row.product_name,`현재 ${new Intl.NumberFormat('ko-KR',{maximumFractionDigits:3}).format(num(row.stock_g)/1000)}kg`))
    const match = firstMention(inventoryRows,userText,['product_name','product_id']) || inventoryRows.find((row:any)=>row.product_id===matchedProduct?.id)
    return { ...base, title:'완제품 재고조정', schema:[field('product_id','제품','select',match?.product_id || '',{required:true,options:invOptions}),field('adjustment_date','조정일','date',today(),{required:true}),field('input_quantity','조정 후 재고','number',match ? String(num(match.stock_g)/1000) : '',{required:true,step:'0.001'}),field('input_unit','단위','select','kg',{options:[option('kg','kg'),option('g','g')]}),field('reason','조정 사유','text','실사 재고 조정',{required:true})], candidates:c.adjustments.map((row:any)=>candidate(row.id,`${row.adjustment_date} · ${products.find((p:any)=>p.id===row.product_id)?.product_name || row.product_id} · ${row.input_quantity}${row.input_unit}`,row)), meta:{inventory:inventoryRows} }
  }

  if (intent.domain === 'receivable') {
    const clientById = new Map(c.clients.map((row:any)=>[row.id,row.company_name]))
    const openOrders = c.orders.filter((row:any)=>row.status==='confirmed').map((row:any)=>option(row.id,`${clientById.get(row.client_id) || '거래처'} · ${row.statement_number || row.id}`,`${row.sale_date} · ${num(row.total_amount).toLocaleString('ko-KR')}원 · ${row.payment_status}`))
    if (intent.operation === 'REVERSE') return { ...base,title:'입금기록 취소',schema:[field('receipt_id','입금기록','select','',{required:true,options:c.receipts.filter((r:any)=>r.status==='posted').map((r:any)=>option(r.id,`${r.receipt_date} · ${num(r.amount).toLocaleString('ko-KR')}원`,r.reference_no||''))}),field('reversal_reason','취소 사유','text','',{required:true})],candidates:[] }
    if (intent.operation === 'SET_DUE') return { ...base,title:'입금예정일 설정',schema:[field('order_id','판매건','select','',{required:true,options:openOrders}),field('due_date','입금예정일','date','',{required:true})],candidates:[] }
    if (intent.operation === 'SET_RULE') return { ...base,title:'거래처 수금조건',schema:[field('client_id','거래처','select',matchedClient?.id || '',{required:true,options:clientOptions}),field('payment_due_type','계산방식','select','none',{options:[option('none','자동 계산 안 함'),option('days_after_sale','판매일 + N일'),option('next_month_day','익월 지정일')]}),field('payment_due_days','판매 후 일수','number','30'),field('payment_due_day','익월 일자','number','10')],candidates:[] }
    return { ...base,title:'입금 등록',schema:[field('order_id','판매건','select','',{required:true,options:openOrders}),field('receipt_date','입금일','date',today(),{required:true}),field('amount','입금액(원)','number','',{required:true}),field('method','입금방법','select','bank',{options:[option('bank','계좌입금'),option('cash','현금'),option('card','카드'),option('other','기타')]}),field('reference_no','참조번호','text',''),field('note','비고','textarea','')],candidates:[] }
  }

  if (intent.domain === 'sales_target') {
    return { ...base,title:'영업 목표매출',schema:[field('month','목표월','month',thisMonth(),{required:true}),field('scope_type','대상','select','company',{options:[option('company','회사 전체'),option('person','담당자')]}),field('person_id','담당자','select',matchedPerson?.id || '',{options:[option('','선택 안 함'),...personOptions]}),field('target_amount','목표매출(원)','number',''),field('note','메모','text','')],candidates:[] }
  }

  if (intent.domain === 'sales_client') {
    return { ...base,title:'거래처 마스터',schema:[field('company_name','거래처명','text','',{required:true}),field('business_registration_number','사업자번호','text',''),field('representative_name','대표자','text',''),field('address','주소','textarea',''),field('contact_name','담당자','text',''),field('phone','전화','text',''),field('email','이메일','text',''),field('payment_terms','결제조건','text',''),field('assigned_person_id','담당 영업','select',matchedPerson?.id || '',{options:[option('','미지정'),...personOptions]}),field('status','상태','select','active',{options:[option('active','활성'),option('inactive','비활성')]}),field('note','메모','textarea','')],candidates:c.clients.map((row:any)=>candidate(row.id,row.company_name,row)),defaults:matchedClient||{} }
  }

  if (intent.domain === 'sales_pricing') {
    const variantCandidates = c.variants.map((row:any)=>candidate(row.id,`${products.find((p:any)=>p.id===row.product_id)?.product_name || row.product_id} · ${row.variant_name} · ${num(row.default_unit_price).toLocaleString('ko-KR')}원`,row))
    return { ...base,title:'판매규격·단가',schema:[field('product_id','제품','select',matchedProduct?.id || '',{required:true,options:productOptions}),field('packaging_material_id','포장재','select','',{options:[option('','연결 안 함'),...active(c.packaging).map((row:any)=>option(row.id,row.material_name,row.spec||row.material_code||''))]}),field('variant_name','판매규격명','text','',{required:true}),field('sales_unit','판매단위','select','kg',{options:[option('kg','kg'),option('ea','EA'),option('box','BOX')]}),field('unit_weight_g','EA 단위중량(g)','number','0'),field('box_units','BOX당 EA','number','0'),field('default_unit_price','기본 판매단가','number','0',{required:true}),field('moq_quantity','MOQ','number','0'),field('is_default','기본규격','checkbox',false),field('active','활성','checkbox',true),field('note','메모','textarea',''),field('client_id','예외 거래처','select',matchedClient?.id || '',{options:[option('','예외 없음'),...clientOptions]}),field('client_unit_price','예외 판매단가','number',''),field('client_moq_quantity','예외 MOQ','number',''),field('client_note','예외 메모','text','')],candidates:variantCandidates }
  }

  if (intent.domain === 'business_person') {
    return { ...base,title:'인력 정보',schema:[field('name','이름','text','',{required:true}),field('person_type','구분','select','sales_freelancer',{options:[option('sales_freelancer','영업 프리랜서'),option('production_freelancer','생산 프리랜서'),option('employee','직원')]}),field('status','상태','select','active',{options:[option('active','활동 중'),option('inactive','종료')]}),field('phone','전화','text',''),field('email','이메일','text',''),field('contract_start','계약 시작','date',''),field('contract_end','계약 종료','date',''),field('commission_rate','커미션(%)','number','0'),field('pay_type','정산방식','select','commission',{options:[option('commission','커미션'),option('hourly','시급'),option('daily','일당'),option('fixed','고정액')]}),field('pay_rate','정산단가','number','0'),field('withholding_rate','원천징수율(%)','number','3.3'),field('contract_document_ready','계약서 확인','checkbox',false),field('id_document_ready','신분증 확인','checkbox',false),field('bank_document_ready','통장 확인','checkbox',false),field('bank_name','은행','text',''),field('bank_account_holder','예금주','text',''),field('bank_account_number','계좌번호','text',''),field('note','메모','textarea','')],candidates:c.people.map((row:any)=>candidate(row.id,`${row.name} · ${row.person_type}`,row)),defaults:matchedPerson||{} }
  }

  if (intent.domain === 'business_opportunity') {
    return { ...base,title:'영업기회',schema:[field('client_id','고객사','select',matchedClient?.id || '',{options:[option('','미지정'),...clientOptions]}),field('title','영업기회명','text','',{required:true}),field('stage','단계','select','lead',{options:[option('lead','신규'),option('contacted','접촉'),option('proposal','제안'),option('negotiation','협상'),option('won','성공'),option('lost','실패')]}),field('expected_amount','예상금액','number','0'),field('won_amount','성공금액','number','0'),field('close_date','종료예정일','date',''),field('next_action_date','다음 행동일','date',''),field('assigned_person_id','담당 영업','select',matchedPerson?.id || '',{options:[option('','미지정'),...personOptions]}),field('note','메모','textarea','')],candidates:c.opportunities.map((row:any)=>candidate(row.id,row.title,row)) }
  }

  if (intent.domain === 'business_activity') {
    return { ...base,title:'영업활동·상담기록',schema:[field('client_id','고객사','select',matchedClient?.id || '',{options:[option('','미지정'),...clientOptions]}),field('opportunity_id','영업기회','select','',{options:[option('','미지정'),...c.opportunities.map((row:any)=>option(row.id,row.title,row.stage))]}),field('activity_date','활동일','date',today(),{required:true}),field('activity_type','활동유형','text','상담'),field('summary','활동내용','textarea','',{required:true}),field('next_action','다음 행동','text',''),field('next_action_date','다음 행동일','date',''),field('assigned_person_id','담당 영업','select',matchedPerson?.id || '',{options:[option('','미지정'),...personOptions]})],candidates:[] }
  }

  return { ...base,title:'생산 프리랜서 작업시간',schema:[field('person_id','생산 프리랜서','select',matchedPerson?.id || '',{required:true,options:people.filter((row:any)=>row.person_type==='production_freelancer').map((row:any)=>option(row.id,row.name))}),field('work_date','작업일','date',today(),{required:true}),field('hours','작업시간','number','0',{required:true,step:'0.25'}),field('pay_amount_override','지급액 수동보정','number',''),field('source_type','출처','text','manual'),field('note','메모','textarea','')],candidates:[] }
}

async function existingConfirmation(loginId: string, threadId: string, sourceUserId: string, domain: MobileExtendedDomain) {
  const db = createMoniServiceRoleClient()
  const result = await db.from('moni_action_confirmations').select('*').eq('business_id',BUSINESS_ID).eq('action_domain',actionDomain(domain)).eq('requested_by_login_id',loginId).eq('source_client_id',`moni-mobile:${threadId}`).order('created_at',{ascending:false}).limit(20)
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []).find((row:any)=>text(row?.payload?.source_user_message_id,100)===sourceUserId) || null
}

async function loadBefore(domain: MobileExtendedDomain, targetId: string) {
  if (!targetId) return null
  const db = createMoniServiceRoleClient()
  const table: Partial<Record<MobileExtendedDomain,string>> = {
    product_master:'products', production_unit:'product_production_units', recipe:'recipes', raw_material_master:'raw_materials', packaging_master:'packaging_materials',
    finished_goods_adjustment:'finished_goods_inventory_adjustments', sales_client:'sales_clients', sales_pricing:'sales_product_variants', business_person:'business_people',
    business_opportunity:'sales_opportunities', business_activity:'sales_activities', business_work_log:'production_freelancer_work_logs',
  }
  const target = table[domain]
  if (!target) return null
  const result = await db.from(target).select('*').eq('id',targetId).eq('business_id',BUSINESS_ID).maybeSingle()
  if (result.error) throw new Error(result.error.message)
  return result.data || null
}

function previewText(intent: MobileExtendedIntent, fields: Record<string,any>, before: any) {
  const label: Record<MobileExtendedDomain,string> = { product_master:'제품',production_unit:'생산단위',recipe:'레시피',raw_material_master:'원재료',packaging_master:'부재료',sanitation:'위생점검',finished_goods_adjustment:'완제품 재고조정',receivable:'수금·미수금',sales_target:'영업 목표',sales_client:'거래처',sales_pricing:'판매규격·단가',business_person:'인력',business_opportunity:'영업기회',business_activity:'영업활동',business_work_log:'작업시간' }
  const key = fields.product_name || fields.item_name || fields.material_name || fields.company_name || fields.name || fields.title || fields.summary || fields.variant_name || fields.checker_name || fields.order_id || fields.product_id || before?.product_name || before?.item_name || before?.material_name || before?.company_name || before?.name || before?.title || before?.id || ''
  return `[${label[intent.domain]} ${intent.operation}] ${text(key,300)} · 모바일 입력카드 검토 후 PC 저장 API로 실행`
}

async function computeFinishedGoodsBalance(request: NextRequest, productId: string, date: string) {
  const payload = await pcApi(request,'/api/moni/finished-goods-inventory','GET')
  const movements = Array.isArray(payload.movements) ? payload.movements : []
  if (date === today()) {
    const row = (Array.isArray(payload.inventory) ? payload.inventory : []).find((item:any)=>text(item.product_id)===productId)
    if (row) return num(row.stock_g)
  }
  return movements.filter((row:any)=>text(row.product_id)===productId && text(row.date || row.work_date || row.sale_date,10) <= date)
    .reduce((sum:number,row:any)=>sum + (text(row.type).toUpperCase()==='INBOUND' ? num(row.quantity_g) : -num(row.quantity_g)),0)
}

async function prepare(request: NextRequest, session: any, threadId: string, body: Record<string,any>) {
  const domain = text(body.domain,80) as MobileExtendedDomain
  const operation = text(body.operation,40) as MobileExtendedIntent['operation']
  const intent = { domain, operation } as MobileExtendedIntent
  const sourceUserId = text(body.source_user_message_id,100)
  const fields = body.fields && typeof body.fields === 'object' ? { ...body.fields } : {}
  const targetId = text(body.target_id,200)
  if (!sourceUserId || !uuidLike(sourceUserId)) throw new Error('원본 사용자 메시지를 확인할 수 없습니다.')
  const exchange = await latestExchange(threadId,session.loginId)
  if (!exchange.user || text(exchange.user.id)!==sourceUserId) throw new Error('현재 대화의 최신 요청과 입력 카드가 일치하지 않습니다.')
  const confirmedIntent = classifyMobileExtendedIntent(text(exchange.user.content,6000))
  if (!confirmedIntent || confirmedIntent.domain!==domain || confirmedIntent.operation!==operation) throw new Error('현재 요청의 업무 종류가 입력 카드와 일치하지 않습니다.')

  const before = await loadBefore(domain,targetId)
  if (operation !== 'CREATE' && !['ADJUST','RECEIVE','SET_DUE','SET_RULE','SET_TARGET','CLEAR_TARGET','REVERSE'].includes(operation) && !before) throw new Error('수정할 기존 데이터를 선택해 주세요.')
  if (domain==='finished_goods_adjustment') {
    if (!fields.product_id || !validDate(fields.adjustment_date)) throw new Error('제품과 조정일을 확인해 주세요.')
    fields.balance_before_g = await computeFinishedGoodsBalance(request,text(fields.product_id,200),validDate(fields.adjustment_date))
  }
  if (domain==='recipe' && operation==='UPDATE' && before) fields.product_id = before.product_id
  if (domain==='sales_pricing' && operation==='UPDATE' && before) fields.product_id = before.product_id

  const db = createMoniServiceRoleClient()
  const oldPending = await db.from('moni_action_confirmations').select('id,payload').eq('business_id',BUSINESS_ID).eq('action_domain',actionDomain(domain)).eq('requested_by_login_id',session.loginId).eq('source_client_id',`moni-mobile:${threadId}`).eq('status','PENDING').limit(20)
  if (oldPending.error) throw new Error(oldPending.error.message)
  const staleIds = (oldPending.data ?? []).filter((row:any)=>text(row?.payload?.source_user_message_id,100)===sourceUserId).map((row:any)=>row.id)
  if (staleIds.length) await db.from('moni_action_confirmations').update({status:'CANCELLED'}).in('id',staleIds).eq('status','PENDING')

  const payload = { domain, semantic_operation: operation, fields, target_id: targetId || null, source_user_message_id: sourceUserId }
  const expiresAt = new Date(Date.now()+15*60_000).toISOString()
  const result = await db.from('moni_action_confirmations').insert({ business_id:BUSINESS_ID,action_domain:actionDomain(domain),action_type:semanticAction(intent),target_id:uuidLike(targetId)?targetId:null,payload,before_snapshot:before,preview_text:previewText(intent,fields,before),warnings:[],status:'PENDING',requested_by_login_id:session.loginId,requested_by_role:session.role,source_client_id:`moni-mobile:${threadId}`,expires_at:expiresAt }).select('id,status,preview_text,warnings,expires_at').single()
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function executeRecipe(request: NextRequest, operation: string, targetId: string, fields: Record<string,any>, before: any) {
  if (operation==='CREATE') {
    const product = await createMoniServiceRoleClient().from('products').select('id,product_name').eq('id',fields.product_id).eq('business_id',BUSINESS_ID).maybeSingle()
    if (product.error || !product.data) throw new Error('레시피 제품을 찾을 수 없습니다.')
    return pcApi(request,'/api/moni/recipes','POST',{...fields,product_name:product.data.product_name,food_type_id:fields.food_type_id || crypto.randomUUID()})
  }
  if (operation==='DELETE') return pcApi(request,`/api/moni/recipes?id=${encodeURIComponent(targetId)}`,'DELETE')
  const db = createMoniServiceRoleClient()
  const productId = text(before?.product_id || fields.product_id,200)
  const product = await db.from('products').select('id,product_name').eq('id',productId).eq('business_id',BUSINESS_ID).maybeSingle()
  const rows = await db.from('recipes').select('*').eq('product_id',productId).eq('business_id',BUSINESS_ID).eq('is_active',true).order('sort_order')
  if (product.error || rows.error || !product.data) throw new Error(product.error?.message || rows.error?.message || '레시피를 다시 조회하지 못했습니다.')
  const recipes = (rows.data ?? []).map((row:any)=>row.id===targetId ? { ...row, food_type_name:fields.food_type_name, ratio_percent:num(fields.ratio_percent), ingredient_type:fields.ingredient_type || row.ingredient_type, sort_order:num(fields.sort_order) } : row)
  return pcApi(request,'/api/moni/recipes','PUT',{product_id:productId,product_name:product.data.product_name,recipes})
}

async function executePc(request: NextRequest, domain: MobileExtendedDomain, operation: string, targetId: string, fields: Record<string,any>, before: any) {
  if (domain==='product_master') {
    if (operation==='CREATE') return pcApi(request,'/api/moni/products','POST',fields)
    return pcApi(request,`/api/moni/products/${encodeURIComponent(targetId)}`,'PATCH',{...fields,...(operation==='DEACTIVATE'||operation==='DELETE'?{is_active:false}:{})})
  }
  if (domain==='production_unit') {
    const productId = text(fields.product_id || before?.product_id,200)
    if (operation==='CREATE') return pcApi(request,`/api/moni/products/${encodeURIComponent(productId)}/production-units`,'POST',fields)
    if (operation==='DELETE') return pcApi(request,`/api/moni/products/${encodeURIComponent(productId)}/production-units/${encodeURIComponent(targetId)}`,'DELETE')
    return pcApi(request,`/api/moni/products/${encodeURIComponent(productId)}/production-units/${encodeURIComponent(targetId)}`,'PATCH',fields)
  }
  if (domain==='recipe') return executeRecipe(request,operation,targetId,fields,before)
  if (domain==='raw_material_master') {
    if (operation==='CREATE') return pcApi(request,'/api/moni/raw-materials','POST',fields)
    return pcApi(request,`/api/moni/raw-materials/${encodeURIComponent(targetId)}`,'PATCH',{...fields,...(operation==='DEACTIVATE'||operation==='DELETE'?{is_active:false}:{})})
  }
  if (domain==='packaging_master') {
    if (operation==='CREATE') return pcApi(request,'/api/moni/packaging-materials','POST',fields)
    return pcApi(request,`/api/moni/packaging-materials/${encodeURIComponent(targetId)}`,'PATCH',{...fields,...(operation==='DEACTIVATE'||operation==='DELETE'?{is_active:false}:{})})
  }
  if (domain==='sanitation') return pcApi(request,'/api/moni/sanitation-logs','POST',fields)
  if (domain==='finished_goods_adjustment') return pcApi(request,'/api/moni/finished-goods-inventory-adjustments','POST',fields)
  if (domain==='receivable') {
    if (operation==='REVERSE') return pcApi(request,'/api/moni/receivables','POST',{action:'reverse_receipt',id:fields.receipt_id,data:{reversal_reason:fields.reversal_reason}})
    if (operation==='SET_DUE') return pcApi(request,'/api/moni/receivables','POST',{action:'set_order_due_date',id:fields.order_id,data:{due_date:fields.due_date}})
    if (operation==='SET_RULE') return pcApi(request,'/api/moni/receivables','POST',{action:'save_client_due_rule',id:fields.client_id,data:{payment_due_type:fields.payment_due_type,payment_due_days:num(fields.payment_due_days),payment_due_day:num(fields.payment_due_day)}})
    return pcApi(request,'/api/moni/receivables','POST',{action:'save_receipt',data:{order_id:fields.order_id,receipt_date:fields.receipt_date,amount:num(fields.amount),method:fields.method,reference_no:fields.reference_no,note:fields.note}})
  }
  if (domain==='sales_target') {
    const data = { month:fields.month,scope_type:fields.scope_type,person_id:fields.scope_type==='person'?fields.person_id:undefined,target_amount:num(fields.target_amount),note:fields.note }
    return pcApi(request,'/api/moni/sales-targets','POST',{action:operation==='CLEAR_TARGET'?'clear_target':'save_target',data})
  }
  if (domain==='sales_client') {
    if (operation==='CREATE') return pcApi(request,'/api/moni/sales-management','POST',{entity:'client',data:fields})
    return pcApi(request,'/api/moni/sales-management','PATCH',{entity:'client',id:targetId,data:{...fields,...(operation==='DEACTIVATE'||operation==='DELETE'?{status:'inactive'}:{})}})
  }
  if (domain==='sales_pricing') {
    const base = await pcApi(request,'/api/moni/sales-pricing-v4','POST',{action:'save_variant',id:targetId || undefined,data:{product_id:fields.product_id,packaging_material_id:fields.packaging_material_id||null,variant_name:fields.variant_name,sales_unit:fields.sales_unit,unit_weight_g:num(fields.unit_weight_g),box_units:num(fields.box_units),default_unit_price:num(fields.default_unit_price),moq_quantity:num(fields.moq_quantity),is_default:Boolean(fields.is_default),active:operation==='DELETE'||operation==='DEACTIVATE'?false:Boolean(fields.active),note:fields.note}})
    const variantId = text(base.variant?.id || targetId,100)
    if (variantId && fields.client_id) await pcApi(request,'/api/moni/sales-pricing-v4','POST',{action:'save_client_variant_term',data:{client_id:fields.client_id,variant_id:variantId,unit_price:num(fields.client_unit_price || fields.default_unit_price),moq_quantity:num(fields.client_moq_quantity || fields.moq_quantity),active:true,note:fields.client_note || ''}})
    return base
  }
  if (domain==='business_person') {
    const entity='people'; const data={...fields,...(operation==='DEACTIVATE'?{status:'inactive'}:{})}
    if (operation==='CREATE') return pcApi(request,'/api/moni/business-management','POST',{entity,data})
    if (operation==='DELETE') return pcApi(request,`/api/moni/business-management?entity=${entity}&id=${encodeURIComponent(targetId)}`,'DELETE')
    return pcApi(request,'/api/moni/business-management','PATCH',{entity,id:targetId,data})
  }
  if (domain==='business_opportunity') {
    const entity='opportunities'
    if (operation==='CREATE') return pcApi(request,'/api/moni/business-management','POST',{entity,data:fields})
    if (operation==='DELETE') return pcApi(request,`/api/moni/business-management?entity=${entity}&id=${encodeURIComponent(targetId)}`,'DELETE')
    return pcApi(request,'/api/moni/business-management','PATCH',{entity,id:targetId,data:fields})
  }
  if (domain==='business_activity') {
    const entity='activities'
    if (operation==='CREATE') return pcApi(request,'/api/moni/business-management','POST',{entity,data:fields})
    if (operation==='DELETE') return pcApi(request,`/api/moni/business-management?entity=${entity}&id=${encodeURIComponent(targetId)}`,'DELETE')
    return pcApi(request,'/api/moni/business-management','PATCH',{entity,id:targetId,data:fields})
  }
  return pcApi(request,'/api/moni/business-management','POST',{entity:'work_logs',data:fields})
}

async function execute(request: NextRequest, session: any, threadId: string, confirmationId: string) {
  if (!uuidLike(confirmationId)) throw new Error('유효한 confirmation_id가 필요합니다.')
  const db = createMoniServiceRoleClient()
  const existing = await db.from('moni_action_confirmations').select('*').eq('id',confirmationId).eq('business_id',BUSINESS_ID).eq('requested_by_login_id',session.loginId).eq('source_client_id',`moni-mobile:${threadId}`).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (!existing.data) throw new Error('승인 요청을 찾을 수 없습니다.')
  if (existing.data.status==='EXECUTED') return existing.data.result_snapshot || { verified:true,duplicate_safe:true }
  if (existing.data.status!=='PENDING') throw new Error(`현재 승인 상태(${existing.data.status})에서는 실행할 수 없습니다.`)
  if (new Date(existing.data.expires_at).getTime() < Date.now()) {
    await db.from('moni_action_confirmations').update({status:'EXPIRED'}).eq('id',confirmationId).eq('status','PENDING')
    throw new Error('승인 시간이 만료되었습니다. 입력 카드를 다시 열어 주세요.')
  }
  const claim = await db.from('moni_action_confirmations').update({status:'EXECUTING',user_confirmation_text:'모바일 입력 카드에서 확정 실행'}).eq('id',confirmationId).eq('status','PENDING').select('*').maybeSingle()
  if (claim.error) throw new Error(claim.error.message)
  if (!claim.data) throw new Error('다른 요청이 먼저 실행 중이거나 이미 처리된 승인입니다.')

  const payload = claim.data.payload || {}
  const domain = text(payload.domain,80) as MobileExtendedDomain
  const operation = text(payload.semantic_operation,40)
  const fields = payload.fields && typeof payload.fields==='object' ? payload.fields : {}
  const targetId = text(payload.target_id,200)
  try {
    const result = await executePc(request,domain,operation,targetId,fields,claim.data.before_snapshot)
    const snapshot = { verified:true,verification_basis:'PC_API_SUCCESS',domain,operation,target_id:targetId||null,result }
    const done = await db.from('moni_action_confirmations').update({status:'EXECUTED',result_snapshot:snapshot,executed_at:new Date().toISOString(),error_message:null}).eq('id',confirmationId).eq('status','EXECUTING')
    if (done.error) throw new Error(done.error.message)
    const auditAction = semanticAction({domain,operation} as MobileExtendedIntent)
    await db.from('moni_action_audit_log').insert({ confirmation_id:confirmationId,business_id:BUSINESS_ID,action_domain:actionDomain(domain),action_type:auditAction,target_table:domain,target_id:uuidLike(targetId)?targetId:null,before_snapshot:claim.data.before_snapshot || null,after_snapshot:snapshot,actor_login_id:session.loginId,actor_role:session.role,source_client_id:`moni-mobile:${threadId}`,user_confirmation_text:'모바일 입력 카드에서 확정 실행' })
    return snapshot
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PC 업무 API 실행 실패'
    await db.from('moni_action_confirmations').update({status:'FAILED',error_message:text(message,1800)}).eq('id',confirmationId).eq('status','EXECUTING')
    throw error
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!
  const threadId = text(request.nextUrl.searchParams.get('thread_id'),80)
  if (!uuidLike(threadId)) return NextResponse.json({ok:false,error:'유효한 thread_id가 필요합니다.'},{status:400})
  try {
    const exchange = await latestExchange(threadId,auth.session.loginId)
    if (!exchange.user) return NextResponse.json({ok:true,card:null},{headers:{'Cache-Control':'no-store'}})
    const intent = classifyMobileExtendedIntent(text(exchange.user.content,6000))
    if (!intent) return NextResponse.json({ok:true,card:null},{headers:{'Cache-Control':'no-store'}})
    const existing = await existingConfirmation(auth.session.loginId,threadId,text(exchange.user.id),intent.domain)
    if (existing) {
      const status=text(existing.status,30)
      if (status==='PENDING'||status==='EXECUTING') return NextResponse.json({ok:true,card:{stage:'confirmation',domain:intent.domain,operation:intent.operation,source_user_message_id:exchange.user.id,confirmation_id:existing.id,preview_text:existing.preview_text,warnings:existing.warnings||[],expires_at:existing.expires_at,busy:status==='EXECUTING'}},{headers:{'Cache-Control':'no-store'}})
      if (status==='EXECUTED') return NextResponse.json({ok:true,card:{stage:'completed',domain:intent.domain,operation:intent.operation,source_user_message_id:exchange.user.id,confirmation_id:existing.id,preview_text:existing.preview_text,result:existing.result_snapshot}},{headers:{'Cache-Control':'no-store'}})
      if (status==='FAILED') return NextResponse.json({ok:true,card:{stage:'failed',domain:intent.domain,operation:intent.operation,source_user_message_id:exchange.user.id,confirmation_id:existing.id,error:existing.error_message}},{headers:{'Cache-Control':'no-store'}})
    }
    const card = await buildDraft(request,intent,text(exchange.user.id),text(exchange.user.content,6000))
    return NextResponse.json({ok:true,card},{headers:{'Cache-Control':'no-store'}})
  } catch (error) {
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:'PC 입력 카드 준비 실패'},{status:500,headers:{'Cache-Control':'no-store'}})
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!
  const body = await request.json().catch(()=>null) as Record<string,any>|null
  if (!body) return NextResponse.json({ok:false,error:'요청 본문이 필요합니다.'},{status:400})
  const threadId=text(body.thread_id,80)
  if (!uuidLike(threadId)) return NextResponse.json({ok:false,error:'유효한 thread_id가 필요합니다.'},{status:400})
  try {
    const command=text(body.command,20).toLowerCase()
    if (command==='prepare') return NextResponse.json({ok:true,confirmation:await prepare(request,auth.session,threadId,body)},{headers:{'Cache-Control':'no-store'}})
    if (command==='execute') return NextResponse.json({ok:true,result:await execute(request,auth.session,threadId,text(body.confirmation_id,80))},{headers:{'Cache-Control':'no-store'}})
    return NextResponse.json({ok:false,error:'지원하지 않는 명령입니다.'},{status:400})
  } catch (error) {
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:'PC 입력 카드 처리 실패'},{status:400,headers:{'Cache-Control':'no-store'}})
  }
}
