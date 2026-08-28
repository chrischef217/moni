import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileManagementCenterIntent, type MobileManagementCenterDomain } from '@/lib/moni/mobile-management-center-intents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const PAGE_SIZE = 30
const MAX_PAGE = 100
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
const money = (value: unknown) => `${Math.round(num(value)).toLocaleString('ko-KR')}원`
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 10))
const validMonth = (value: unknown) => /^\d{4}-\d{2}$/.test(text(value, 7))
const safeSearch = (value: unknown) => text(value, 80).replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim()

function todayKst() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()) }
function monthKst() { return todayKst().slice(0, 7) }
function shiftDate(date: string, days: number) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
function monthBounds(month: string) {
  const start = `${month}-01`
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { from: start, to: new Date(next.getTime() - 86400000).toISOString().slice(0, 10) }
}
function previousMonthBounds() {
  const now = new Date(`${todayKst()}T00:00:00Z`)
  now.setUTCDate(1); now.setUTCMonth(now.getUTCMonth() - 1)
  return monthBounds(now.toISOString().slice(0, 7))
}
function dateDefaults(userText: string) {
  const dates = userText.match(/20\d{2}-\d{2}-\d{2}/g) || []
  if (dates.length >= 2) return { from: dates[0], to: dates[1] }
  if (dates.length === 1) return { from: dates[0], to: dates[0] }
  if (/(지난\s*달|전월)/.test(userText)) return previousMonthBounds()
  if (/(이번\s*달|금월|현재\s*월)/.test(userText)) return monthBounds(monthKst())
  return { from: shiftDate(todayKst(), -89), to: todayKst() }
}
function pageNo(value: unknown) { const n = Math.floor(num(value)); return Math.max(1, Math.min(MAX_PAGE, n || 1)) }
function dateRange(filters: Record<string, any>) {
  const from = validDate(filters.from) ? text(filters.from, 10) : ''
  const to = validDate(filters.to) ? text(filters.to, 10) : ''
  if (from && to && from > to) throw new Error('시작일은 종료일보다 늦을 수 없습니다.')
  return { from, to }
}
function statusLabel(value: unknown) {
  const v = text(value).toUpperCase()
  const map: Record<string, string> = { DRAFT:'작성중', REVIEW:'검토', APPROVED:'승인', ISSUED:'발행', SENT:'발송', CANCELLED:'취소', GENERATED:'생성', SHIPPED:'출고', CONFIRMED:'확정', PAID:'지급완료', PLANNED:'예정', POSTED:'반영', REVERSED:'취소' }
  return map[v] || text(value) || '-'
}
function json(payload: unknown, status = 200) { return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } }) }

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: json({ ok:false, error:'로그인이 필요합니다.' }, 401) }
  if (session.role !== 'admin') return { session: null, response: json({ ok:false, error:'관리자만 이 업무를 사용할 수 있습니다.' }, 403) }
  return { session, response: null }
}

async function latestUser(threadId: string, loginId: string) {
  const db = createMoniServiceRoleClient()
  const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', loginId).eq('status', 'ACTIVE').maybeSingle()
  if (thread.error) throw new Error(thread.error.message)
  if (!thread.data) throw new Error('현재 MONI 대화방을 확인할 수 없습니다.')
  const messages = await db.from('moni_ai_messages').select('id,role,content').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).order('created_at', { ascending:false }).limit(14)
  if (messages.error) throw new Error(messages.error.message)
  return (messages.data ?? []).find((row:any) => row.role === 'user') || null
}

async function verifyTurn(session: any, body: Record<string, any>) {
  const threadId = text(body.thread_id, 80)
  const sourceId = text(body.source_user_message_id, 80)
  if (!uuidLike(threadId) || !uuidLike(sourceId)) throw new Error('현재 대화의 관리 요청을 확인할 수 없습니다.')
  const latest = await latestUser(threadId, session.loginId)
  if (!latest || text(latest.id, 80) !== sourceId) throw new Error('현재 대화의 최신 요청과 관리 카드가 일치하지 않습니다.')
  const intent = classifyMobileManagementCenterIntent(latest.content)
  if (!intent || intent.domain !== body.domain) throw new Error('현재 요청의 관리 업무 종류가 카드와 일치하지 않습니다.')
  return { threadId, latest, intent }
}

async function pcApi(request: NextRequest, path: string, method = 'GET', body?: unknown) {
  const url = new URL(path, request.url)
  const headers: Record<string,string> = { 'Content-Type':'application/json' }
  const cookie = request.headers.get('cookie'); if (cookie) headers.cookie = cookie
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache:'no-store' })
  const payload = await response.json().catch(() => ({})) as Record<string,any>
  if (!response.ok || payload.ok === false) throw new Error(text(payload.error, 1500) || `${path} 처리 실패 (${response.status})`)
  return payload
}

function buildCard(domain: MobileManagementCenterDomain, source: any) {
  const defaults = dateDefaults(text(source.content, 5000))
  const common = { stage:'draft', domain, operation:'READ', source_user_message_id:text(source.id,80), warnings:[] as string[] }
  if (domain === 'sales_statement_history') return { ...common, title:'거래명세표 전체 이력', filters:[
    {key:'from',label:'시작일',type:'date',value:defaults.from},{key:'to',label:'종료일',type:'date',value:defaults.to},
    {key:'status',label:'상태',type:'select',value:'',options:[{value:'',label:'전체'},{value:'confirmed',label:'확정'},{value:'cancelled',label:'취소'}]},
    {key:'q',label:'거래처·명세표번호 검색',type:'text',value:''},
  ] }
  if (domain === 'export_document_history') return { ...common, title:'수출서류 전체 이력', filters:[
    {key:'from',label:'시작일',type:'date',value:defaults.from},{key:'to',label:'종료일',type:'date',value:defaults.to},
    {key:'status',label:'상태',type:'select',value:'',options:[{value:'',label:'전체'},{value:'DRAFT',label:'작성중'},{value:'GENERATED',label:'생성'},{value:'SHIPPED',label:'출고'},{value:'CANCELLED',label:'취소'}]},
    {key:'q',label:'수출처·문서번호 검색',type:'text',value:''},
  ] }
  if (domain === 'official_document_history') return { ...common, title:'대외공문 조회·출력', filters:[
    {key:'from',label:'시작일',type:'date',value:defaults.from},{key:'to',label:'종료일',type:'date',value:defaults.to},
    {key:'status',label:'상태',type:'select',value:'',options:[{value:'',label:'전체'},{value:'DRAFT',label:'작성중'},{value:'REVIEW',label:'검토'},{value:'APPROVED',label:'승인'},{value:'ISSUED',label:'발행'},{value:'SENT',label:'발송'},{value:'CANCELLED',label:'취소'}]},
    {key:'q',label:'수신처·제목·공문번호 검색',type:'text',value:''},
  ] }
  return { ...common, title:'현금흐름·세무 종합관리', filters:[{key:'month',label:'조회 월',type:'month',value:/(지난\s*달|전월)/.test(source.content) ? previousMonthBounds().from.slice(0,7) : monthKst()}], warnings:['세무 수치는 MONI에 등록된 자료 기준 참고값이며 실제 신고세액 확정값이 아닙니다.'] }
}

async function querySalesStatements(filters: Record<string,any>) {
  const db = createMoniServiceRoleClient(); const { from, to } = dateRange(filters); const page = pageNo(filters.page); const q = safeSearch(filters.q); const status = text(filters.status,30).toLowerCase()
  let clientIds: string[] = []
  if (q) {
    const clients = await db.from('sales_clients').select('id').eq('business_id',BUSINESS_ID).ilike('company_name',`%${q}%`).limit(100)
    if (clients.error) throw new Error(clients.error.message)
    clientIds = (clients.data ?? []).map((r:any)=>text(r.id,80)).filter(Boolean)
  }
  let query = db.from('sales_orders').select('id,statement_number,sale_date,client_id,status,total_amount,due_date,payment_status,vat_amount',{count:'exact'}).eq('business_id',BUSINESS_ID)
  if (from) query=query.gte('sale_date',from); if (to) query=query.lte('sale_date',to); if(status) query=query.eq('status',status)
  if(q) {
    const statement = `statement_number.ilike.%${q}%`
    query = clientIds.length ? query.or(`${statement},client_id.in.(${clientIds.join(',')})`) : query.ilike('statement_number',`%${q}%`)
  }
  const start=(page-1)*PAGE_SIZE; const result=await query.order('sale_date',{ascending:false}).order('created_at',{ascending:false}).range(start,start+PAGE_SIZE-1)
  if(result.error)throw new Error(result.error.message)
  const rows=result.data??[]; const ids=Array.from(new Set(rows.map((r:any)=>r.client_id).filter(Boolean)))
  const clients=ids.length?await db.from('sales_clients').select('id,company_name').in('id',ids):{data:[],error:null}; if(clients.error)throw new Error(clients.error.message)
  const names=new Map((clients.data??[]).map((r:any)=>[r.id,r.company_name]))
  return { title:'거래명세표 전체 이력',page,page_size:PAGE_SIZE,total:result.count??rows.length,rows:rows.map((r:any)=>({id:r.id,title:r.statement_number||'거래명세표',subtitle:`${r.sale_date||'-'} · ${names.get(r.client_id)||'거래처 미확인'}`,meta:`${money(r.total_amount)} · 수금 ${statusLabel(r.payment_status)}`,badges:[statusLabel(r.status)],links:[{label:'거래명세표 열기',href:`/sales-management/orders/${encodeURIComponent(r.id)}/statement`}]})) }
}

async function queryExportDocuments(filters: Record<string,any>) {
  const db=createMoniServiceRoleClient(); const {from,to}=dateRange(filters); const page=pageNo(filters.page); const q=safeSearch(filters.q); const status=text(filters.status,30).toUpperCase()
  let query=db.from('export_documents').select('id,document_date,status,invoice_no,packing_list_no,consignee_id,consignee_snapshot,bill_to,incoterm,total_amount,currency,transaction_statement_number,created_at',{count:'exact'})
  if(from)query=query.gte('document_date',from); if(to)query=query.lte('document_date',to); if(status)query=query.eq('status',status)
  if(q)query=query.or(`invoice_no.ilike.%${q}%,packing_list_no.ilike.%${q}%,transaction_statement_number.ilike.%${q}%,bill_to.ilike.%${q}%`)
  const start=(page-1)*PAGE_SIZE; const result=await query.order('document_date',{ascending:false}).order('created_at',{ascending:false}).range(start,start+PAGE_SIZE-1); if(result.error)throw new Error(result.error.message)
  const rows=result.data??[]
  return { title:'수출서류 전체 이력',page,page_size:PAGE_SIZE,total:result.count??rows.length,rows:rows.map((r:any)=>{const snap=r.consignee_snapshot||{};const consignee=text(snap.company_name||snap.destination_name||snap.country||r.bill_to)||'수출처 미확인';return {id:r.id,title:r.invoice_no||'Commercial Invoice',subtitle:`${r.document_date||'-'} · ${consignee}`,meta:`${r.packing_list_no||'Packing List 번호 없음'}${r.transaction_statement_number?` · ${r.transaction_statement_number}`:''}`,badges:[statusLabel(r.status)],links:[{label:'Invoice / Packing List',href:`/sales-management/export/documents/${encodeURIComponent(r.id)}/print`},{label:'연결 거래명세표',href:`/sales-management/export/documents/${encodeURIComponent(r.id)}/statement`}]} }) }
}

async function queryOfficialDocuments(filters: Record<string,any>) {
  const db=createMoniServiceRoleClient(); const {from,to}=dateRange(filters); const page=pageNo(filters.page); const q=safeSearch(filters.q); const status=text(filters.status,30).toUpperCase()
  let query=db.from('official_documents').select('id,document_no,document_date,document_type,status,recipient_company_name,recipient_contact_name,title,issued_at,sent_at,created_at',{count:'exact'})
  if(from)query=query.gte('document_date',from); if(to)query=query.lte('document_date',to); if(status)query=query.eq('status',status)
  if(q)query=query.or(`document_no.ilike.%${q}%,recipient_company_name.ilike.%${q}%,recipient_contact_name.ilike.%${q}%,title.ilike.%${q}%`)
  const start=(page-1)*PAGE_SIZE; const result=await query.order('document_date',{ascending:false}).order('created_at',{ascending:false}).range(start,start+PAGE_SIZE-1); if(result.error)throw new Error(result.error.message)
  const rows=result.data??[]
  return { title:'대외공문 조회·출력',page,page_size:PAGE_SIZE,total:result.count??rows.length,rows:rows.map((r:any)=>({id:r.id,title:r.document_no||'공문 작성중',subtitle:`${r.document_date||'-'} · ${r.recipient_company_name||'수신처 미확인'}`,meta:r.title||'제목 없음',badges:[statusLabel(r.status)],links:[{label:'공문 열기·출력',href:`/api/moni/official-documents/${encodeURIComponent(r.id)}/print`}]})) }
}

async function queryTaxControl(request: NextRequest, filters: Record<string,any>) {
  const month=validMonth(filters.month)?text(filters.month,7):monthKst(); const payload=await pcApi(request,`/api/moni/financial-control?month=${encodeURIComponent(month)}&_=${Date.now()}`)
  const summary=payload.summary||{}; const tax=payload.tax||{}; const accounts=Array.isArray(payload.accounts)?payload.accounts:[]; const settlements=Array.isArray(payload.settlements)?payload.settlements.filter((r:any)=>text(r.settlement_month).startsWith(month)):[]; const actual=Array.isArray(payload.actual_rows)?payload.actual_rows:[]; const forecast=Array.isArray(payload.forecast_rows)?payload.forecast_rows:[]
  return {
    title:'현금흐름·세무 종합관리',month,basis:text(tax.basis)||'등록 자료 기준 참고값',
    summary_cards:[
      {label:'실제 입금',value:money(summary.actual_inflow),tone:'positive'},{label:'실제 출금',value:money(summary.actual_outflow),tone:'negative'},{label:'월 순증감',value:money(summary.actual_net_movement),tone:num(summary.actual_net_movement)>=0?'positive':'negative'},
      {label:'30일 예정 입금',value:money(summary.planned_30d_inflow)},{label:'30일 예정 출금',value:money(summary.planned_30d_outflow)},{label:'등록 계좌잔액',value:summary.registered_account_balance===null?'미등록':money(summary.registered_account_balance)},
      {label:'매출 VAT',value:money(tax.output_vat)},{label:'공제 등록 VAT',value:money(tax.registered_input_vat)},{label:'VAT 차액 참고',value:money(tax.registered_vat_difference),tone:num(tax.registered_vat_difference)>0?'negative':'positive'},
      {label:'프리랜서 원천징수 참고',value:money(tax.freelancer_withholding_reference)},
    ],
    accounts:accounts.map((r:any)=>({id:r.id,name:r.account_name,type:r.account_type,balance:r.latest_balance,balance_date:r.balance_date,stale_days:r.stale_days,active:r.active!==false})),
    settlements:settlements.map((r:any)=>({id:r.id,person_name:r.person_name||'담당자',source_type:r.source_type,settlement_month:r.settlement_month,gross_amount:r.gross_amount,withholding_amount:r.withholding_amount,net_amount:r.net_amount,status:r.status,due_date:r.due_date,paid_date:r.paid_date})),
    actual_rows:actual.slice(0,20), forecast_rows:forecast.slice(0,20),
  }
}

async function prepareFinanceAction(session:any, threadId:string, sourceId:string, body:Record<string,any>) {
  const financeAction=text(body.finance_action,60); const targetId=text(body.target_id,100); const data=body.data&&typeof body.data==='object'?body.data:{}
  if(!['set_settlement_due_date','mark_settlement_paid','reverse_settlement_payment'].includes(financeAction))throw new Error('지원하지 않는 재무 관리 작업입니다.')
  if(!uuidLike(targetId))throw new Error('처리할 정산건을 확인할 수 없습니다.')
  if(financeAction==='set_settlement_due_date'&&data.due_date&&!validDate(data.due_date))throw new Error('지급예정일을 확인해 주세요.')
  if(financeAction==='mark_settlement_paid'&&!validDate(data.paid_date))throw new Error('지급일을 확인해 주세요.')
  if(financeAction==='reverse_settlement_payment'&&!text(data.reason,500))throw new Error('지급취소 사유를 입력해 주세요.')
  const db=createMoniServiceRoleClient(); const before=await db.from('freelancer_settlements').select('*').eq('id',targetId).eq('business_id',BUSINESS_ID).maybeSingle(); if(before.error)throw new Error(before.error.message); if(!before.data)throw new Error('정산건을 찾을 수 없습니다.')
  const old=await db.from('moni_action_confirmations').select('id').eq('business_id',BUSINESS_ID).eq('requested_by_login_id',session.loginId).eq('source_client_id',`moni-mobile:${threadId}`).eq('status','PENDING').limit(20); if(old.error)throw new Error(old.error.message); if((old.data??[]).length)await db.from('moni_action_confirmations').update({status:'CANCELLED'}).in('id',(old.data??[]).map((r:any)=>r.id)).eq('status','PENDING')
  const labels:Record<string,string>={set_settlement_due_date:'지급예정일 변경',mark_settlement_paid:'지급완료 처리',reverse_settlement_payment:'지급완료 취소'}
  const confirmation=await db.from('moni_action_confirmations').insert({business_id:BUSINESS_ID,action_domain:'mobile_management_tax_control',action_type:'UPDATE',target_id:targetId,payload:{domain:'tax_control',finance_action:financeAction,target_id:targetId,data,source_user_message_id:sourceId},before_snapshot:before.data,preview_text:`[${labels[financeAction]}] ${before.data.person_name||before.data.person_id||'프리랜서'} 정산건을 PC 재무관리 규칙으로 처리합니다.`,warnings:['확정 실행 후 공식 재무·정산 데이터에 즉시 반영됩니다.'],status:'PENDING',requested_by_login_id:session.loginId,requested_by_role:session.role,source_client_id:`moni-mobile:${threadId}`,expires_at:new Date(Date.now()+15*60_000).toISOString()}).select('id,status,preview_text,warnings,expires_at').single(); if(confirmation.error)throw new Error(confirmation.error.message); return confirmation.data
}

async function executeFinanceAction(request:NextRequest,session:any,threadId:string,confirmationId:string) {
  const db=createMoniServiceRoleClient(); const found=await db.from('moni_action_confirmations').select('*').eq('id',confirmationId).eq('business_id',BUSINESS_ID).eq('requested_by_login_id',session.loginId).eq('source_client_id',`moni-mobile:${threadId}`).maybeSingle(); if(found.error)throw new Error(found.error.message); const row=found.data; if(!row)throw new Error('확정 요청을 찾을 수 없습니다.')
  if(row.status==='EXECUTED')return row.result_snapshot||{verified:true,duplicate_safe:true}; if(row.status!=='PENDING')throw new Error(`현재 승인 상태(${row.status})에서는 실행할 수 없습니다.`); if(new Date(row.expires_at).getTime()<Date.now()){await db.from('moni_action_confirmations').update({status:'EXPIRED'}).eq('id',row.id).eq('status','PENDING');throw new Error('승인 시간이 만료되었습니다. 다시 확인해 주세요.')}
  const claim=await db.from('moni_action_confirmations').update({status:'EXECUTING',user_confirmation_text:'모바일 세무 종합관리에서 확정 실행'}).eq('id',row.id).eq('status','PENDING').select('*').maybeSingle(); if(claim.error)throw new Error(claim.error.message); if(!claim.data)throw new Error('다른 요청이 먼저 실행 중이거나 이미 처리된 승인입니다.')
  const p=claim.data.payload||{}; if(p.domain!=='tax_control')throw new Error('세무 종합관리 승인건이 아닙니다.')
  try{const result=await pcApi(request,'/api/moni/financial-control','POST',{action:p.finance_action,id:p.target_id,data:p.data||{}}); const snapshot={verified:true,verification_basis:'CANONICAL_PC_FINANCIAL_CONTROL_API_SUCCESS',finance_action:p.finance_action,target_id:p.target_id,result}; const done=await db.from('moni_action_confirmations').update({status:'EXECUTED',result_snapshot:snapshot,executed_at:new Date().toISOString(),error_message:null}).eq('id',row.id).eq('status','EXECUTING'); if(done.error)throw new Error(done.error.message); await db.from('moni_action_audit_log').insert({confirmation_id:row.id,business_id:BUSINESS_ID,action_domain:'mobile_management_tax_control',action_type:'UPDATE',target_table:'freelancer_settlements',target_id:p.target_id,before_snapshot:claim.data.before_snapshot||null,after_snapshot:snapshot,actor_login_id:session.loginId,actor_role:session.role,source_client_id:`moni-mobile:${threadId}`,user_confirmation_text:'모바일 세무 종합관리에서 확정 실행'}); return snapshot}
  catch(error){await db.from('moni_action_confirmations').update({status:'FAILED',error_message:text(error instanceof Error?error.message:'재무 처리 실패',1500)}).eq('id',row.id).eq('status','EXECUTING');throw error}
}

export async function GET(request:NextRequest) {
  const auth=await requireAdmin(request); if(auth.response||!auth.session)return auth.response!
  const threadId=text(request.nextUrl.searchParams.get('thread_id'),80); if(!uuidLike(threadId))return json({ok:true,card:null})
  try{const latest=await latestUser(threadId,auth.session.loginId); if(!latest)return json({ok:true,card:null}); const intent=classifyMobileManagementCenterIntent(latest.content); if(!intent)return json({ok:true,card:null}); return json({ok:true,card:buildCard(intent.domain,latest)})}
  catch(error){return json({ok:false,error:error instanceof Error?error.message:'관리 카드를 준비하지 못했습니다.'},500)}
}

export async function POST(request:NextRequest) {
  const auth=await requireAdmin(request); if(auth.response||!auth.session)return auth.response!
  const body=await request.json().catch(()=>null) as Record<string,any>|null; if(!body)return json({ok:false,error:'요청 본문이 필요합니다.'},400)
  const command=text(body.command,30).toLowerCase()
  try{
    if(command==='execute_finance'){const threadId=text(body.thread_id,80);const confirmationId=text(body.confirmation_id,80);if(!uuidLike(threadId)||!uuidLike(confirmationId))throw new Error('확정 실행 정보를 확인할 수 없습니다.');const result=await executeFinanceAction(request,auth.session,threadId,confirmationId);return json({ok:true,result})}
    const turn=await verifyTurn(auth.session,body)
    if(command==='prepare_finance'){if(turn.intent.domain!=='tax_control')throw new Error('세무 종합관리 작업이 아닙니다.');const confirmation=await prepareFinanceAction(auth.session,turn.threadId,text(turn.latest.id,80),body);return json({ok:true,confirmation})}
    if(command!=='query')throw new Error('지원하지 않는 관리 명령입니다.')
    const filters=body.filters&&typeof body.filters==='object'?body.filters:{}
    const result=turn.intent.domain==='sales_statement_history'?await querySalesStatements(filters):turn.intent.domain==='export_document_history'?await queryExportDocuments(filters):turn.intent.domain==='official_document_history'?await queryOfficialDocuments(filters):await queryTaxControl(request,filters)
    return json({ok:true,result})
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:'모바일 관리 업무를 처리하지 못했습니다.'},400)}
}
