import { NextRequest, NextResponse } from 'next/server'
import { GET as getV2, POST as postV2 } from '@/app/api/moni/mobile-extended-actions-v2/route'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobilePcParityIntent, type MobilePcParityDomain, type MobilePcParityIntent } from '@/lib/moni/mobile-pc-parity-intents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown, max = 3000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0 }
const bool = (value: unknown) => value === true || String(value).toLowerCase() === 'true' || value === 1 || value === '1'
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const todayKst = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
const field = (key: string, label: string, type = 'text', value: any = '', required = false, options?: Array<{ value: string; label: string; sub?: string }>, step?: string) => ({ key, label, type, value, required, options, step })
const candidate = (id: unknown, label: string, values: Record<string, any>) => ({ id: text(id, 100), label, values })
const actionDomain = (domain: string) => `mobile_pc_parity_${domain}`
const semanticAction = (op: string) => op === 'CREATE' ? 'CREATE' : op === 'DELETE' ? 'DELETE' : 'UPDATE'

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

async function latestUser(threadId: string, loginId: string) {
  const db = createMoniServiceRoleClient()
  const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', loginId).eq('status', 'ACTIVE').maybeSingle()
  if (thread.error) throw new Error(thread.error.message)
  if (!thread.data) throw new Error('현재 MONI 대화방을 확인할 수 없습니다.')
  const messages = await db.from('moni_ai_messages').select('id,role,content').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).order('created_at', { ascending: false }).limit(12)
  if (messages.error) throw new Error(messages.error.message)
  return (messages.data ?? []).find((row: any) => row.role === 'user') || null
}

async function pcApi(request: NextRequest, path: string, method = 'GET', body?: unknown) {
  const url = new URL(path, request.url)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const cookie = request.headers.get('cookie')
  if (cookie) headers.cookie = cookie
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
  const payload = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok || payload.ok === false) throw new Error(text(payload.error, 1800) || `${path} 처리 실패 (${response.status})`)
  return payload
}

async function buildDraft(intent: MobilePcParityIntent, source: any) {
  const db = createMoniServiceRoleClient()
  const base = { stage: 'draft', domain: intent.domain, operation: intent.operation, source_user_message_id: text(source.id, 100), title: '', schema: [] as any[], candidates: [] as any[], defaults: {} as Record<string, any>, warnings: ['PC와 동일한 저장 API를 사용하며, 실행 전 미리보기와 별도 확정이 필요합니다.'] }

  if (intent.domain === 'raw_material_pricing') {
    const rows = await db.from('raw_materials').select('id,item_code,item_name,unit_price_per_kg,price_per_pack,pack_quantity,pack_weight_g').eq('business_id', BUSINESS_ID).eq('is_active', true).order('item_name')
    if (rows.error) throw new Error(rows.error.message)
    return { ...base, title: '원재료 기준단가 수정', schema: [field('unit_price_per_kg','kg 기준단가(원)','number','',false,undefined,'0.01'),field('price_per_pack','포장단가(원)','number','',false,undefined,'0.01'),field('pack_quantity','포장수량','number','',false,undefined,'0.001'),field('pack_weight_g','포장중량(g)','number','',false,undefined,'1')], candidates: (rows.data ?? []).map((r:any)=>candidate(r.id,`${r.item_name}${r.item_code?` · ${r.item_code}`:''}`,r)) }
  }

  if (intent.domain === 'purchase_supplier') {
    const rows = await db.from('purchase_suppliers').select('*').eq('business_id', BUSINESS_ID).order('company_name')
    if (rows.error) throw new Error(rows.error.message)
    return { ...base, title: intent.operation === 'CREATE' ? '매입처 등록' : '매입처 수정', schema: [field('supplier_code','매입처 코드'),field('company_name','매입처명','text','',true),field('supplier_type','구분','select','MATERIAL',true,[{value:'MATERIAL',label:'원재료'},{value:'PACKAGING',label:'부재료'},{value:'BOTH',label:'둘 다'}]),field('contact_person','담당자'),field('phone','전화번호'),field('email','이메일'),field('payment_terms_days','지급조건(일)','number','0'),field('status','상태','select','ACTIVE',true,[{value:'ACTIVE',label:'거래중'},{value:'INACTIVE',label:'거래중지'}])], candidates:(rows.data??[]).map((r:any)=>candidate(r.id,r.company_name,r)) }
  }

  if (intent.domain === 'purchase_receipt') {
    const [suppliers, purchases, raw, pack] = await Promise.all([
      db.from('purchase_suppliers').select('id,company_name,status').eq('business_id',BUSINESS_ID).order('company_name'),
      db.from('purchases').select('*').eq('business_id',BUSINESS_ID).neq('status','CANCELLED').order('receipt_date',{ascending:false}).limit(150),
      db.from('raw_materials').select('id,item_name').eq('business_id',BUSINESS_ID).eq('is_active',true).order('item_name'),
      db.from('packaging_materials').select('id,material_name').eq('business_id',BUSINESS_ID).eq('is_active',true).order('material_name'),
    ])
    for (const result of [suppliers,purchases,raw,pack]) if (result.error) throw new Error(result.error.message)
    const materialOpts=[...(raw.data??[]).map((r:any)=>({value:r.id,label:`원재료 · ${r.item_name}`})),...(pack.data??[]).map((r:any)=>({value:r.id,label:`부재료 · ${r.material_name}`}))]
    return { ...base, title:intent.operation==='DELETE'?'매입·입고 삭제':'매입·입고 수정', schema:[field('supplier_id','매입처','select','',true,(suppliers.data??[]).filter((r:any)=>r.status==='ACTIVE').map((r:any)=>({value:r.id,label:r.company_name}))),field('purchase_date','매입일','date','',true),field('receipt_date','입고일','date','',true),field('purchase_category','구분','select','RAW_MATERIAL',true,[{value:'RAW_MATERIAL',label:'원재료'},{value:'PACKAGING',label:'부재료'}]),field('material_id','품목','select','',true,materialOpts),field('quantity','수량','number','',true,undefined,'0.001'),field('unit','단위','select','KG',true,[{value:'KG',label:'KG'},{value:'G',label:'G'},{value:'EA',label:'EA'}]),field('due_date','지급예정일','date'),field('planned_payment_method','지급방법','select','OTHER',false,[{value:'BANK_TRANSFER',label:'계좌이체'},{value:'CARD',label:'카드'},{value:'CASH',label:'현금'},{value:'OTHER',label:'기타'}]),field('notes','비고','textarea')], candidates:(purchases.data??[]).map((r:any)=>candidate(r.id,`${r.receipt_date||r.purchase_date} · ${r.purchase_no||r.id} · ${Number(r.total_amount||0).toLocaleString('ko-KR')}원`,r)) }
  }

  if (intent.domain === 'export_destination') {
    const [rows,clients]=await Promise.all([db.from('export_destinations').select('*').eq('business_id',BUSINESS_ID).order('destination_name'),db.from('sales_clients').select('id,company_name').eq('business_id',BUSINESS_ID).order('company_name')])
    if(rows.error)throw new Error(rows.error.message); if(clients.error)throw new Error(clients.error.message)
    return {...base,title:intent.operation==='CREATE'?'수출처 등록':'수출처 수정',schema:[field('destination_name','수출처명','text','',true),field('client_id','연결 거래처','select','',false,(clients.data??[]).map((r:any)=>({value:r.id,label:r.company_name}))),field('country_name','국가명','text','',true),field('country_code','국가코드'),field('currency','통화','text','USD',true),field('business_no','사업자/세금번호'),field('contact_name','담당자'),field('contact_phone','전화'),field('contact_email','이메일'),field('zip_code','우편번호'),field('address_line1','주소1'),field('address_line2','주소2'),field('incoterms','Incoterms'),field('payment_terms','결제조건'),field('shipping_method','운송방법'),field('use_yn','사용','checkbox',true)],candidates:(rows.data??[]).map((r:any)=>candidate(r.id,`${r.destination_name} · ${r.country_name||''}`,r))}
  }

  if (intent.domain === 'export_item') {
    const [rows,products,dests]=await Promise.all([db.from('export_product_settings').select('*').eq('business_id',BUSINESS_ID).order('created_at',{ascending:false}),db.from('products').select('id,product_name').eq('business_id',BUSINESS_ID).order('product_name'),db.from('export_destinations').select('id,destination_name').eq('business_id',BUSINESS_ID).eq('use_yn',true).order('destination_name')])
    for(const r of [rows,products,dests])if(r.error)throw new Error(r.error.message)
    return {...base,title:intent.operation==='CREATE'?'수출품목 등록':'수출품목 수정',schema:[field('product_id','제품','select','',true,(products.data??[]).map((r:any)=>({value:r.id,label:r.product_name}))),field('destination_id','수출처','select','',false,(dests.data??[]).map((r:any)=>({value:r.id,label:r.destination_name}))),field('hs_code','HS Code'),field('name_en','영문 제품명'),field('net_quantity','순중량/수량','number','',false,undefined,'0.001'),field('net_unit','단위','text','kg'),field('carton_pack_quantity','카톤 포장수량','number','',false,undefined,'0.001'),field('currency','통화','text','USD'),field('unit_price','수출단가','number','',false,undefined,'0.01'),field('use_yn','사용','checkbox',true)],candidates:(rows.data??[]).map((r:any)=>candidate(r.id,`${r.name_en||r.product_id} · ${r.hs_code||'HS 미등록'}`,r))}
  }

  if (intent.domain === 'official_document') {
    const [docs,clients,profile]=await Promise.all([db.from('official_documents').select('*').eq('business_id',BUSINESS_ID).order('document_date',{ascending:false}).limit(150),db.from('sales_clients').select('id,company_name').eq('business_id',BUSINESS_ID).order('company_name'),db.from('company_profile').select('*').eq('id','default').maybeSingle()])
    if(docs.error)throw new Error(docs.error.message); if(clients.error)throw new Error(clients.error.message); if(profile.error)throw new Error(profile.error.message)
    return {...base,title:intent.operation==='CREATE'?'대외 공문 작성':intent.operation==='DELETE'?'대외 공문 삭제':'대외 공문 수정',schema:[field('document_type','문서유형','select','GENERAL',true,[{value:'GENERAL',label:'일반 안내'},{value:'REQUEST',label:'요청·협조'},{value:'CHANGE',label:'통보·변경'},{value:'REPLY',label:'회신·확인'},{value:'APOLOGY',label:'사과·정정'},{value:'FREE',label:'자유 형식'}]),field('document_date','시행일자','date',todayKst(),true),field('recipient_client_id','수신 거래처','select','',false,(clients.data??[]).map((r:any)=>({value:r.id,label:r.company_name}))),field('recipient_company_name','수신 회사명','text','',true),field('recipient_contact_name','수신 담당자'),field('recipient_address','수신 주소'),field('recipient_email','수신 이메일'),field('recipient_phone','수신 전화'),field('title','제목','text','',true),field('greeting','인사말','textarea','귀사의 무궁한 발전을 기원합니다.'),field('reference_text','관련 근거','textarea'),field('body','본문','textarea','',true),field('request_summary','요청·결론','textarea'),field('author_name','작성자'),field('approver_name','승인자','text',profile.data?.representative_name_ko||''),field('use_signature','대표서명 사용','checkbox',true)],candidates:(docs.data??[]).map((r:any)=>candidate(r.id,`${r.document_date} · ${r.document_no||'작성중'} · ${r.title||'제목 없음'}`,r))}
  }

  if (intent.domain === 'financial_cash') {
    const rows=await db.from('cash_flow').select('*').eq('business_id',BUSINESS_ID).order('created_at',{ascending:false}).limit(150); if(rows.error)throw new Error(rows.error.message)
    return {...base,title:intent.operation==='CREATE'?'입출금 등록':intent.operation==='REVERSE'?'입출금 취소':'입출금 수정',schema:[field('type','구분','select','outflow',true,[{value:'inflow',label:'입금'},{value:'outflow',label:'출금'}]),field('status','상태','select','planned',true,[{value:'planned',label:'예정'},{value:'posted',label:'실제반영'}]),field('category','분류','select','other',true,[{value:'purchase',label:'매입'},{value:'operating_expense',label:'운영비'},{value:'payroll',label:'급여'},{value:'tax',label:'세금'},{value:'financing',label:'금융'},{value:'investment',label:'투자'},{value:'transfer',label:'이체'},{value:'other',label:'기타'}]),field('counterpart','상대처'),field('amount','금액','number','',true,undefined,'1'),field('due_date','예정일','date'),field('actual_date','실제일','date'),field('reference_no','참조번호'),field('vat_amount','부가세','number','0',false,undefined,'1'),field('vat_deductible','매입세액 공제','checkbox',false),field('tax_invoice_date','세금계산서 기준일','date'),field('note','비고','textarea'),field('reversal_reason','취소 사유','textarea')],candidates:(rows.data??[]).map((r:any)=>candidate(r.id,`${r.due_date||r.actual_date||''} · ${r.counterpart||r.note||r.category} · ${Number(r.amount||0).toLocaleString('ko-KR')}원`,r))}
  }

  if (intent.domain === 'financial_account') {
    const rows=await db.from('finance_accounts').select('*').eq('business_id',BUSINESS_ID).order('account_name'); if(rows.error)throw new Error(rows.error.message)
    return {...base,title:intent.operation==='CREATE'?'재무 계좌/현금함 등록':'재무 계좌/현금함 수정',schema:[field('account_name','이름','text','',true),field('account_type','유형','select','bank',true,[{value:'bank',label:'은행계좌'},{value:'cash',label:'현금함'}]),field('institution_name','금융기관'),field('masked_account_no','계좌번호 표시값'),field('active','사용','checkbox',true),field('note','비고','textarea')],candidates:(rows.data??[]).map((r:any)=>candidate(r.id,r.account_name,r))}
  }

  if (intent.domain === 'financial_balance') {
    const accounts=await db.from('finance_accounts').select('id,account_name,active').eq('business_id',BUSINESS_ID).eq('active',true).order('account_name'); if(accounts.error)throw new Error(accounts.error.message)
    return {...base,title:'계좌/현금함 잔액 입력',schema:[field('account_id','계좌/현금함','select','',true,(accounts.data??[]).map((r:any)=>({value:r.id,label:r.account_name}))),field('balance_date','기준일','date',todayKst(),true),field('balance_amount','잔액','number','',true,undefined,'1'),field('note','비고','textarea')]}
  }

  if (intent.domain === 'company_profile') {
    const profile=await db.from('company_profile').select('*').eq('id','default').maybeSingle(); if(profile.error)throw new Error(profile.error.message)
    const p=profile.data||{}
    return {...base,title:'회사 설정 수정',schema:[field('company_name_ko','상호(국문)','text',p.company_name_ko||'',true),field('company_name_en','상호(영문)','text',p.company_name_en||''),field('business_registration_number','사업자등록번호','text',p.business_registration_number||'',true),field('representative_name_ko','대표자(국문)','text',p.representative_name_ko||'',true),field('representative_name_en','대표자(영문)','text',p.representative_name_en||''),field('opening_date','개업일','date',p.opening_date||''),field('address_ko','주소(국문)','textarea',p.address_ko||''),field('address_en','주소(영문)','textarea',p.address_en||''),field('company_email','회사 이메일','text',p.company_email||''),field('company_phone','회사 전화','text',p.company_phone||''),field('business_type','업태','text',p.business_type||''),field('business_items','종목','text',p.business_items||''),field('bank_name','은행명','text',p.bank_name||''),field('bank_account_holder','예금주','text',p.bank_account_holder||''),field('bank_account_number','계좌번호','text',p.bank_account_number||''),field('logo_data_url','회사 로고','image',p.logo_data_url||''),field('signature_data_url','대표 서명','image',p.signature_data_url||'')]}
  }

  if (intent.domain === 'sales_return_credit') {
    const orders=await db.from('sales_orders').select('id,statement_number,sale_date,client_id,total_amount,status,source_type').eq('business_id',BUSINESS_ID).eq('status','confirmed').not('source_type','in','(RETURN,CREDIT)').order('sale_date',{ascending:false}).limit(120); if(orders.error)throw new Error(orders.error.message)
    const ids=(orders.data??[]).map((r:any)=>r.id); const items=ids.length?await db.from('sales_order_items').select('id,order_id,product_name,quantity,unit,specification,product_id,sales_variant_id').in('order_id',ids).order('created_at'):{data:[],error:null} as any; if(items.error)throw new Error(items.error.message)
    const orderById=new Map((orders.data??[]).map((r:any)=>[r.id,r])); const returnable=(items.data??[]).filter((r:any)=>r.product_id&&r.specification!=='기타비용')
    const itemOpts=returnable.map((r:any)=>({value:r.id,label:`${orderById.get(r.order_id)?.statement_number||r.order_id} · ${r.product_name} · 최대 ${r.quantity} ${r.unit}`,sub:r.order_id}))
    return {...base,title:'제품 반품 / 매출 차감',schema:[field('adjustment_type','처리유형','select','RETURN',true,[{value:'RETURN',label:'제품 반품'},{value:'CREDIT',label:'매출 차감'}]),field('original_order_id','원거래','select','',true,(orders.data??[]).map((r:any)=>({value:r.id,label:`${r.sale_date} · ${r.statement_number} · ${Number(r.total_amount||0).toLocaleString('ko-KR')}원`}))),field('sale_date','처리일','date',todayKst(),true),field('reason','사유','textarea','',true),field('credit_amount','차감금액','number','',false,undefined,'1'),...Array.from({length:8},(_,i)=>[field(`return_item_${i+1}`,`반품 품목 ${i+1}`,'select','',false,itemOpts),field(`return_qty_${i+1}`,`반품 수량 ${i+1}`,'number','',false,undefined,'0.001')]).flat()]}
  }

  if (intent.domain === 'raw_material_mapping') {
    const [mappings,materials,recipes]=await Promise.all([db.from('raw_material_mapping').select('*').eq('business_id',BUSINESS_ID).eq('is_default',true).order('created_at',{ascending:false}).limit(200),db.from('raw_materials').select('id,item_name').eq('business_id',BUSINESS_ID).eq('is_active',true).order('item_name'),db.from('recipes').select('id,product_id,product_name,food_type_id,food_type_name').eq('business_id',BUSINESS_ID).eq('is_active',true).order('product_name').limit(500)])
    for(const r of [mappings,materials,recipes])if(r.error)throw new Error(r.error.message)
    const foodTypes=[...new Map((recipes.data??[]).filter((r:any)=>r.food_type_id).map((r:any)=>[r.food_type_id,{value:r.food_type_id,label:r.food_type_name||r.food_type_id}])).values()] as any[]
    return {...base,title:intent.operation==='CREATE'?'원재료 매핑 등록':intent.operation==='DELETE'?'원재료 매핑 삭제':'원재료 매핑 수정',schema:[field('mapping_scope','적용범위','select','global',true,[{value:'global',label:'전체'},{value:'product',label:'제품'},{value:'recipe',label:'레시피'}]),field('recipe_id','레시피','select','',false,(recipes.data??[]).map((r:any)=>({value:r.id,label:`${r.product_name} · ${r.food_type_name}`}))),field('product_id','제품 ID'),field('product_name','제품명'),field('food_type_id','식품유형','select','',true,foodTypes),field('raw_material_ref_id','연결 원재료','select','',true,(materials.data??[]).map((r:any)=>({value:r.id,label:r.item_name}))),field('raw_material_name','원재료명'),field('packing_unit','포장단위'),field('packing_weight_g','포장중량(g)','number','',false,undefined,'1')],candidates:(mappings.data??[]).map((r:any)=>candidate(r.id,`${r.product_name||'전체'} · ${r.raw_material_name||r.raw_material_ref_id}`,r))}
  }

  return null
}

function needsTarget(intent: MobilePcParityIntent) { return ['UPDATE','DELETE','REVERSE'].includes(intent.operation) && !['company_profile'].includes(intent.domain) }

async function beforeSnapshot(domain: MobilePcParityDomain, targetId: string) {
  if (!targetId) return null
  const db=createMoniServiceRoleClient()
  const table: Partial<Record<MobilePcParityDomain,string>>={raw_material_pricing:'raw_materials',purchase_supplier:'purchase_suppliers',purchase_receipt:'purchases',export_destination:'export_destinations',export_item:'export_product_settings',official_document:'official_documents',financial_cash:'cash_flow',financial_account:'finance_accounts',raw_material_mapping:'raw_material_mapping'}
  const name=table[domain]; if(!name)return null
  const row=await db.from(name).select('*').eq('id',targetId).maybeSingle(); if(row.error)throw new Error(row.error.message); return row.data
}

async function prepareParity(session:any, body:Record<string,any>) {
  const threadId=text(body.thread_id,80), sourceId=text(body.source_user_message_id,100), targetId=text(body.target_id,100)
  if(!uuidLike(threadId)||!uuidLike(sourceId))throw new Error('현재 대화의 입력 카드를 확인할 수 없습니다.')
  const latest=await latestUser(threadId,session.loginId); if(!latest||text(latest.id,100)!==sourceId)throw new Error('현재 대화의 최신 요청과 입력 카드가 일치하지 않습니다.')
  const intent=classifyMobilePcParityIntent(latest.content); if(!intent||intent.domain!==body.domain||intent.operation!==body.operation)throw new Error('현재 요청의 업무 종류가 입력 카드와 일치하지 않습니다.')
  if(needsTarget(intent)&&!targetId)throw new Error('수정·삭제할 기존 기록을 선택해 주세요.')
  const fields=body.fields&&typeof body.fields==='object'?body.fields:{}
  const db=createMoniServiceRoleClient(); const old=await db.from('moni_action_confirmations').select('id').eq('business_id',BUSINESS_ID).eq('requested_by_login_id',session.loginId).eq('source_client_id',`moni-mobile:${threadId}`).eq('status','PENDING').limit(30); if(old.error)throw new Error(old.error.message); if((old.data??[]).length)await db.from('moni_action_confirmations').update({status:'CANCELLED'}).in('id',(old.data??[]).map((r:any)=>r.id)).eq('status','PENDING')
  const before=await beforeSnapshot(intent.domain,targetId)
  const confirmation=await db.from('moni_action_confirmations').insert({business_id:BUSINESS_ID,action_domain:actionDomain(intent.domain),action_type:semanticAction(intent.operation),target_id:targetId||null,payload:{domain:intent.domain,semantic_operation:intent.operation,fields,target_id:targetId||null,source_user_message_id:sourceId},before_snapshot:before,preview_text:`[${intent.domain} ${intent.operation}] 모바일 입력값을 PC와 동일한 업무 API로 실행합니다.`,warnings:['실행 후 PC와 동일한 공식 데이터에 즉시 반영됩니다.'],status:'PENDING',requested_by_login_id:session.loginId,requested_by_role:session.role,source_client_id:`moni-mobile:${threadId}`,expires_at:new Date(Date.now()+15*60_000).toISOString()}).select('id,status,preview_text,warnings,expires_at').single(); if(confirmation.error)throw new Error(confirmation.error.message); return confirmation.data
}

async function executeParity(request:NextRequest,session:any,threadId:string,row:any) {
  const db=createMoniServiceRoleClient(); if(row.status==='EXECUTED')return row.result_snapshot||{verified:true,duplicate_safe:true}; if(row.status!=='PENDING')throw new Error(`현재 승인 상태(${row.status})에서는 실행할 수 없습니다.`); if(new Date(row.expires_at).getTime()<Date.now()){await db.from('moni_action_confirmations').update({status:'EXPIRED'}).eq('id',row.id).eq('status','PENDING');throw new Error('승인 시간이 만료되었습니다. 입력 카드를 다시 열어 주세요.')}
  const claim=await db.from('moni_action_confirmations').update({status:'EXECUTING',user_confirmation_text:'모바일 입력 카드에서 확정 실행'}).eq('id',row.id).eq('status','PENDING').select('*').maybeSingle(); if(claim.error)throw new Error(claim.error.message); if(!claim.data)throw new Error('다른 요청이 먼저 실행 중이거나 이미 처리된 승인입니다.')
  const p=claim.data.payload||{}, domain=text(p.domain,80) as MobilePcParityDomain, op=text(p.semantic_operation,40), id=text(p.target_id,100), f=p.fields||{}
  try {
    let result:any
    if(domain==='raw_material_pricing') result=await pcApi(request,`/api/moni/raw-materials/${encodeURIComponent(id)}/pricing`,'PATCH',{unit_price_per_kg:num(f.unit_price_per_kg),price_per_pack:num(f.price_per_pack),pack_quantity:num(f.pack_quantity),pack_weight_g:num(f.pack_weight_g)})
    else if(domain==='purchase_supplier') result=await pcApi(request,'/api/moni/purchases','POST',{action:op==='CREATE'?'create_supplier':'update_supplier',id:id||undefined,...f,payment_terms_days:num(f.payment_terms_days)})
    else if(domain==='purchase_receipt') result=await pcApi(request,'/api/moni/purchase-receipts','POST',op==='DELETE'?{action:'delete_purchase',id}:{action:'update_purchase',id,...f,quantity:num(f.quantity)})
    else if(domain==='export_destination') result=await pcApi(request,'/api/moni/export-destinations',op==='CREATE'?'POST':'PATCH',{...(op==='UPDATE'?{id}:{}),...f,use_yn:bool(f.use_yn)})
    else if(domain==='export_item') result=await pcApi(request,'/api/moni/export-products',op==='CREATE'?'POST':'PATCH',{...(op==='UPDATE'?{id}:{}),...f,net_quantity:num(f.net_quantity),carton_pack_quantity:num(f.carton_pack_quantity),unit_price:num(f.unit_price),use_yn:bool(f.use_yn)})
    else if(domain==='official_document') result=op==='DELETE'?await pcApi(request,`/api/moni/official-documents?id=${encodeURIComponent(id)}`,'DELETE'):await pcApi(request,'/api/moni/official-documents',op==='CREATE'?'POST':'PATCH',{...(op==='UPDATE'?{id,action:'save'}:{action:'create'}),...f,use_signature:bool(f.use_signature),attachment_names:Array.isArray(f.attachment_names)?f.attachment_names:[]})
    else if(domain==='financial_cash') result=await pcApi(request,'/api/moni/financial-control','POST',op==='REVERSE'?{action:'reverse_cash_entry',id,data:{reversal_reason:f.reversal_reason}}:{action:'save_cash_entry',id:op==='UPDATE'?id:undefined,data:{...f,amount:num(f.amount),vat_amount:num(f.vat_amount),vat_deductible:bool(f.vat_deductible)}})
    else if(domain==='financial_account') result=await pcApi(request,'/api/moni/financial-control','POST',{action:'save_account',id:op==='UPDATE'?id:undefined,data:{...f,active:bool(f.active)}})
    else if(domain==='financial_balance') result=await pcApi(request,'/api/moni/financial-control','POST',{action:'save_balance_snapshot',data:{...f,balance_amount:num(f.balance_amount)}})
    else if(domain==='company_profile') result=await pcApi(request,'/api/moni/company-profile','PATCH',f)
    else if(domain==='sales_return_credit') {
      const items=[] as any[]; for(let i=1;i<=8;i++){const itemId=text(f[`return_item_${i}`],100),quantity=num(f[`return_qty_${i}`]);if(itemId&&quantity>0)items.push({original_order_item_id:itemId,quantity})}
      result=await pcApi(request,'/api/moni/sales-return-credit-v2','POST',{data:{adjustment_type:text(f.adjustment_type).toUpperCase(),original_order_id:f.original_order_id,sale_date:f.sale_date,reason:f.reason,credit_amount:num(f.credit_amount),items}})
    }
    else if(domain==='raw_material_mapping') {
      const material=await db.from('raw_materials').select('item_name').eq('id',f.raw_material_ref_id).eq('business_id',BUSINESS_ID).maybeSingle(); if(material.error)throw new Error(material.error.message)
      const payload={...f,raw_material_name:material.data?.item_name||f.raw_material_name,packing_weight_g:num(f.packing_weight_g)}
      result=op==='DELETE'?await pcApi(request,`/api/moni/raw-material-mapping?id=${encodeURIComponent(id)}`,'DELETE'):await pcApi(request,'/api/moni/raw-material-mapping',op==='CREATE'?'POST':'PATCH',{...(op==='UPDATE'?{id}:{}),...payload})
    } else throw new Error('지원하지 않는 모바일 PC 동등 업무입니다.')
    const snapshot={verified:true,verification_basis:'CANONICAL_PC_API_SUCCESS',domain,operation:op,target_id:id||null,result}
    const done=await db.from('moni_action_confirmations').update({status:'EXECUTED',result_snapshot:snapshot,executed_at:new Date().toISOString(),error_message:null}).eq('id',row.id).eq('status','EXECUTING'); if(done.error)throw new Error(done.error.message)
    await db.from('moni_action_audit_log').insert({confirmation_id:row.id,business_id:BUSINESS_ID,action_domain:actionDomain(domain),action_type:semanticAction(op),target_table:domain,target_id:uuidLike(id)?id:null,before_snapshot:claim.data.before_snapshot||null,after_snapshot:snapshot,actor_login_id:session.loginId,actor_role:session.role,source_client_id:`moni-mobile:${threadId}`,user_confirmation_text:'모바일 입력 카드에서 확정 실행'})
    return snapshot
  } catch(error){const message=error instanceof Error?error.message:'PC 업무 API 실행 실패';await db.from('moni_action_confirmations').update({status:'FAILED',error_message:text(message,1800)}).eq('id',row.id).eq('status','EXECUTING');throw error}
}

export async function GET(request:NextRequest) {
  const auth=await requireAdmin(request); if(auth.response||!auth.session)return getV2(request)
  const threadId=text(request.nextUrl.searchParams.get('thread_id'),80); if(!uuidLike(threadId))return getV2(request)
  try { const latest=await latestUser(threadId,auth.session.loginId); const intent=classifyMobilePcParityIntent(latest?.content); if(!latest||!intent)return getV2(request); const card=await buildDraft(intent,latest); return NextResponse.json({ok:true,card},{headers:{'Cache-Control':'no-store'}}) }
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'PC 동등 입력 카드 준비 실패'},{status:500,headers:{'Cache-Control':'no-store'}})}
}

export async function POST(request:NextRequest) {
  const body=await request.clone().json().catch(()=>null) as Record<string,any>|null; if(!body)return postV2(request)
  const command=text(body.command,20).toLowerCase(), threadId=text(body.thread_id,80)
  if(command==='prepare'&&classifyMobilePcParityIntent(text((await latestUser(threadId,(await getSessionFromRequest(request))?.loginId||''))?.content))) {
    const auth=await requireAdmin(request); if(auth.response||!auth.session)return auth.response!
    try { const confirmation=await prepareParity(auth.session,body); return NextResponse.json({ok:true,confirmation},{headers:{'Cache-Control':'no-store'}}) }
    catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'PC 동등 입력 카드 준비 실패'},{status:400,headers:{'Cache-Control':'no-store'}})}
  }
  if(command==='execute'&&uuidLike(body.confirmation_id)&&uuidLike(threadId)) {
    const auth=await requireAdmin(request); if(auth.response||!auth.session)return auth.response!
    const db=createMoniServiceRoleClient(); const confirmation=await db.from('moni_action_confirmations').select('*').eq('id',text(body.confirmation_id,80)).eq('business_id',BUSINESS_ID).eq('requested_by_login_id',auth.session.loginId).eq('source_client_id',`moni-mobile:${threadId}`).maybeSingle(); if(confirmation.error)return NextResponse.json({ok:false,error:confirmation.error.message},{status:400})
    if(confirmation.data&&text(confirmation.data.action_domain).startsWith('mobile_pc_parity_')) { try { const result=await executeParity(request,auth.session,threadId,confirmation.data); return NextResponse.json({ok:true,result},{headers:{'Cache-Control':'no-store'}}) } catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'PC 동등 입력 카드 실행 실패'},{status:400,headers:{'Cache-Control':'no-store'}})} }
  }
  return postV2(request)
}
