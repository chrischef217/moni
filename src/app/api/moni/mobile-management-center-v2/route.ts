import { NextRequest, NextResponse } from 'next/server'
import { GET as v1GET, POST as v1POST } from '@/app/api/moni/mobile-management-center/route'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileManagementCenterIntent } from '@/lib/moni/mobile-management-center-intents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const PAGE_SIZE = 30
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0 }
const money = (value: unknown) => `${Math.round(num(value)).toLocaleString('ko-KR')}원`
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 10))
const safeSearch = (value: unknown) => text(value, 80).replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim()
const exportStatusLabel = (value: unknown) => ({DRAFT:'작성중',GENERATED:'생성',SHIPPED:'출고',CANCELLED:'취소'}[text(value).toUpperCase()] || text(value) || '-')
const salesStatusLabel = (value: unknown) => ({CONFIRMED:'확정',CANCELLED:'취소'}[text(value).toUpperCase()] || text(value) || '-')
const paymentStatusLabel = (value: unknown) => ({UNPAID:'미수',PARTIAL:'부분수금',PAID:'수금완료'}[text(value).toUpperCase()] || text(value) || '-')

async function latestUser(threadId: string, loginId: string) {
  const db=createMoniServiceRoleClient()
  const thread=await db.from('moni_ai_threads').select('id').eq('id',threadId).eq('business_id',BUSINESS_ID).eq('user_login_id',loginId).eq('status','ACTIVE').maybeSingle()
  if(thread.error)throw new Error(thread.error.message); if(!thread.data)throw new Error('현재 MONI 대화방을 확인할 수 없습니다.')
  const rows=await db.from('moni_ai_messages').select('id,role,content').eq('business_id',BUSINESS_ID).eq('thread_id',threadId).order('created_at',{ascending:false}).limit(14)
  if(rows.error)throw new Error(rows.error.message)
  return (rows.data??[]).find((row:any)=>row.role==='user')||null
}

async function verifyRequest(request: NextRequest, body: Record<string,any>, domain: 'sales_statement_history'|'export_document_history') {
  const session=await getSessionFromRequest(request)
  if(!session)return { response:NextResponse.json({ok:false,error:'로그인이 필요합니다.'},{status:401}), session:null, threadId:'', sourceId:'' }
  if(session.role!=='admin')return { response:NextResponse.json({ok:false,error:'관리자만 이 업무를 사용할 수 있습니다.'},{status:403}), session:null, threadId:'', sourceId:'' }
  const threadId=text(body.thread_id,80),sourceId=text(body.source_user_message_id,80)
  if(!uuidLike(threadId)||!uuidLike(sourceId))return { response:NextResponse.json({ok:false,error:'현재 대화의 관리 요청을 확인할 수 없습니다.'},{status:400}), session:null, threadId:'', sourceId:'' }
  const latest=await latestUser(threadId,session.loginId)
  const intent=latest?classifyMobileManagementCenterIntent(latest.content):null
  if(!latest||text(latest.id,80)!==sourceId||intent?.domain!==domain)return { response:NextResponse.json({ok:false,error:'현재 대화의 최신 관리 요청과 카드가 일치하지 않습니다.'},{status:409}), session:null, threadId:'', sourceId:'' }
  return { response:null, session, threadId, sourceId }
}

function commonFilters(body: Record<string,any>) {
  const filters=body.filters&&typeof body.filters==='object'?body.filters:{}
  const from=validDate(filters.from)?text(filters.from,10):'',to=validDate(filters.to)?text(filters.to,10):''
  if(from&&to&&from>to)throw new Error('시작일은 종료일보다 늦을 수 없습니다.')
  return { filters,from,to,page:Math.max(1,Math.min(100,Math.floor(num(filters.page))||1)),q:safeSearch(filters.q),status:text(filters.status,30) }
}

async function pcApi(request: NextRequest, path: string, method='GET', body?: unknown) {
  const url=new URL(path,request.url);const headers:Record<string,string>={'Content-Type':'application/json'};const cookie=request.headers.get('cookie');if(cookie)headers.cookie=cookie
  const response=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const payload=await response.json().catch(()=>({})) as Record<string,any>
  if(!response.ok||payload.ok===false)throw new Error(text(payload.error,1500)||`${path} 처리 실패 (${response.status})`);return payload
}

async function salesQuery(request: NextRequest, body: Record<string,any>) {
  const verified=await verifyRequest(request,body,'sales_statement_history'); if(verified.response)return verified.response
  const {from,to,page,q,status}=commonFilters(body)
  const db=createMoniServiceRoleClient();let clientIds:string[]=[]
  if(q){const clients=await db.from('sales_clients').select('id').eq('business_id',BUSINESS_ID).ilike('company_name',`%${q}%`).limit(100);if(clients.error)throw new Error(clients.error.message);clientIds=(clients.data??[]).map((row:any)=>text(row.id,80)).filter(Boolean)}
  let query=db.from('sales_orders').select('id,statement_number,sale_date,client_id,manual_client_name,status,total_amount,payment_status,due_date,created_at',{count:'exact'}).eq('business_id',BUSINESS_ID)
  if(from)query=query.gte('sale_date',from);if(to)query=query.lte('sale_date',to);if(status)query=query.eq('status',status.toLowerCase())
  if(q){const base=`statement_number.ilike.%${q}%,manual_client_name.ilike.%${q}%`;query=clientIds.length?query.or(`${base},client_id.in.(${clientIds.join(',')})`):query.or(base)}
  const start=(page-1)*PAGE_SIZE;const found=await query.order('sale_date',{ascending:false}).order('created_at',{ascending:false}).range(start,start+PAGE_SIZE-1);if(found.error)throw new Error(found.error.message)
  const rows=found.data??[];const ids=Array.from(new Set(rows.map((row:any)=>text(row.client_id,80)).filter(Boolean)))
  const clients=ids.length?await db.from('sales_clients').select('id,company_name').in('id',ids):{data:[],error:null};if(clients.error)throw new Error(clients.error.message);const names=new Map((clients.data??[]).map((row:any)=>[text(row.id,80),text(row.company_name,300)]))
  const shaped=rows.map((row:any)=>({id:row.id,title:row.statement_number||'거래명세표',subtitle:`${row.sale_date||'-'} · ${names.get(text(row.client_id,80))||text(row.manual_client_name,300)||'거래처 미확인'}`,meta:`${money(row.total_amount)} · 수금 ${paymentStatusLabel(row.payment_status)}${row.due_date?` · 예정 ${row.due_date}`:''}`,badges:[salesStatusLabel(row.status)],links:[{label:'거래명세표 열기',href:`/sales-management/orders/${encodeURIComponent(row.id)}/statement`}]}))
  return NextResponse.json({ok:true,result:{title:'거래명세표 전체 이력',page,page_size:PAGE_SIZE,total:found.count??shaped.length,rows:shaped}},{headers:{'Cache-Control':'no-store'}})
}

function exportActions(statusValue: unknown) {
  const status=text(statusValue).toUpperCase();const actions:Array<{action:string;label:string;tone?:string}>=[]
  if(status!=='SHIPPED'&&status!=='CANCELLED')actions.push({action:'SHIP',label:'출고확정'})
  if(status!=='CANCELLED')actions.push({action:'CANCEL',label:'취소',tone:'danger'})
  if(status!=='SHIPPED')actions.push({action:'DELETE',label:'삭제',tone:'danger'})
  return actions
}

async function exportQuery(request: NextRequest, body: Record<string,any>) {
  const verified=await verifyRequest(request,body,'export_document_history'); if(verified.response)return verified.response
  const {from,to,page,q,status}=commonFilters(body);const db=createMoniServiceRoleClient();let destinationIds:string[]=[]
  if(q){const destinations=await db.from('export_destinations').select('id').or(`company_name.ilike.%${q}%,country.ilike.%${q}%`).limit(100);if(destinations.error)throw new Error(destinations.error.message);destinationIds=(destinations.data??[]).map((row:any)=>text(row.id,100)).filter(Boolean)}
  let query=db.from('export_documents').select('id,document_date,status,invoice_no,packing_list_no,consignee_id,consignee_snapshot,bill_to,incoterm,final_destination,sales_order_id,created_at',{count:'exact'})
  if(from)query=query.gte('document_date',from);if(to)query=query.lte('document_date',to);if(status)query=query.eq('status',status.toUpperCase())
  if(q){const base=`invoice_no.ilike.%${q}%,packing_list_no.ilike.%${q}%,bill_to.ilike.%${q}%,final_destination.ilike.%${q}%`;query=destinationIds.length?query.or(`${base},consignee_id.in.(${destinationIds.join(',')})`):query.or(base)}
  const start=(page-1)*PAGE_SIZE;const found=await query.order('document_date',{ascending:false}).order('created_at',{ascending:false}).range(start,start+PAGE_SIZE-1);if(found.error)throw new Error(found.error.message)
  const rows=(found.data??[]).map((row:any)=>{const snap=row.consignee_snapshot&&typeof row.consignee_snapshot==='object'?row.consignee_snapshot:{};const consignee=text(snap.company_name||snap.country||row.bill_to)||'수출처 미확인';return {id:row.id,title:row.invoice_no||'Commercial Invoice',subtitle:`${row.document_date||'-'} · ${consignee}`,meta:`${row.packing_list_no||'Packing List 번호 없음'}${row.incoterm?` · ${row.incoterm}`:''}${row.final_destination?` · ${row.final_destination}`:''}`,badges:[exportStatusLabel(row.status)],links:[{label:'Invoice / Packing List',href:`/sales-management/export/documents/${encodeURIComponent(row.id)}/print`},{label:'연결 거래명세표',href:`/sales-management/export/documents/${encodeURIComponent(row.id)}/statement`}],actions:exportActions(row.status)} })
  return NextResponse.json({ok:true,result:{title:'수출서류 전체 이력',page,page_size:PAGE_SIZE,total:found.count??rows.length,rows}},{headers:{'Cache-Control':'no-store'}})
}

async function prepareExportAction(request:NextRequest,body:Record<string,any>) {
  const verified=await verifyRequest(request,body,'export_document_history');if(verified.response)return verified.response
  const action=text(body.export_action,20).toUpperCase(),targetId=text(body.target_id,140);if(!['SHIP','CANCEL','DELETE'].includes(action))return NextResponse.json({ok:false,error:'지원하지 않는 수출서류 관리 작업입니다.'},{status:400});if(!targetId)return NextResponse.json({ok:false,error:'처리할 수출서류를 확인할 수 없습니다.'},{status:400})
  const db=createMoniServiceRoleClient();const before=await db.from('export_documents').select('*').eq('id',targetId).maybeSingle();if(before.error)throw new Error(before.error.message);if(!before.data)return NextResponse.json({ok:false,error:'수출서류를 찾을 수 없습니다.'},{status:404})
  const status=text(before.data.status).toUpperCase();if(action==='SHIP'&&['SHIPPED','CANCELLED'].includes(status))return NextResponse.json({ok:false,error:'현재 상태에서는 출고확정할 수 없습니다.'},{status:400});if(action==='DELETE'&&status==='SHIPPED')return NextResponse.json({ok:false,error:'출고확정된 서류는 삭제할 수 없습니다. 먼저 취소 처리해 주세요.'},{status:400})
  const old=await db.from('moni_action_confirmations').select('id').eq('business_id',BUSINESS_ID).eq('requested_by_login_id',verified.session.loginId).eq('source_client_id',`moni-mobile:${verified.threadId}`).eq('status','PENDING').limit(20);if(old.error)throw new Error(old.error.message);if((old.data??[]).length)await db.from('moni_action_confirmations').update({status:'CANCELLED'}).in('id',(old.data??[]).map((r:any)=>r.id)).eq('status','PENDING')
  const labels:Record<string,string>={SHIP:'출고확정',CANCEL:'수출서류 취소',DELETE:'수출서류 삭제'};const warnings=action==='DELETE'?['삭제 후에는 되돌릴 수 없습니다. 연결된 수출품목 기록도 함께 삭제될 수 있습니다.']:['확정 실행 후 공식 수출서류 상태에 즉시 반영됩니다.']
  const confirmation=await db.from('moni_action_confirmations').insert({business_id:BUSINESS_ID,action_domain:'mobile_management_export_document',action_type:action==='DELETE'?'DELETE':'UPDATE',target_id:targetId,payload:{domain:'export_document_history',export_action:action,target_id:targetId,source_user_message_id:verified.sourceId},before_snapshot:before.data,preview_text:`[${labels[action]}] ${before.data.invoice_no||targetId} · 현재 ${exportStatusLabel(before.data.status)} 상태를 PC 수출관리 규칙으로 처리합니다.`,warnings,status:'PENDING',requested_by_login_id:verified.session.loginId,requested_by_role:verified.session.role,source_client_id:`moni-mobile:${verified.threadId}`,expires_at:new Date(Date.now()+15*60_000).toISOString()}).select('id,status,preview_text,warnings,expires_at').single();if(confirmation.error)throw new Error(confirmation.error.message)
  return NextResponse.json({ok:true,confirmation},{headers:{'Cache-Control':'no-store'}})
}

async function executeExportAction(request:NextRequest,body:Record<string,any>) {
  const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({ok:false,error:'로그인이 필요합니다.'},{status:401});if(session.role!=='admin')return NextResponse.json({ok:false,error:'관리자만 이 업무를 사용할 수 있습니다.'},{status:403})
  const threadId=text(body.thread_id,80),confirmationId=text(body.confirmation_id,80);if(!uuidLike(threadId)||!uuidLike(confirmationId))return NextResponse.json({ok:false,error:'확정 실행 정보를 확인할 수 없습니다.'},{status:400})
  const db=createMoniServiceRoleClient();const found=await db.from('moni_action_confirmations').select('*').eq('id',confirmationId).eq('business_id',BUSINESS_ID).eq('action_domain','mobile_management_export_document').eq('requested_by_login_id',session.loginId).eq('source_client_id',`moni-mobile:${threadId}`).maybeSingle();if(found.error)throw new Error(found.error.message);const row=found.data;if(!row)return NextResponse.json({ok:false,error:'확정 요청을 찾을 수 없습니다.'},{status:404});if(row.status==='EXECUTED')return NextResponse.json({ok:true,result:row.result_snapshot||{verified:true,duplicate_safe:true}});if(row.status!=='PENDING')return NextResponse.json({ok:false,error:`현재 승인 상태(${row.status})에서는 실행할 수 없습니다.`},{status:409});if(new Date(row.expires_at).getTime()<Date.now()){await db.from('moni_action_confirmations').update({status:'EXPIRED'}).eq('id',row.id).eq('status','PENDING');return NextResponse.json({ok:false,error:'승인 시간이 만료되었습니다. 다시 확인해 주세요.'},{status:409})}
  const claim=await db.from('moni_action_confirmations').update({status:'EXECUTING',user_confirmation_text:'모바일 수출서류 관리에서 확정 실행'}).eq('id',row.id).eq('status','PENDING').select('*').maybeSingle();if(claim.error)throw new Error(claim.error.message);if(!claim.data)return NextResponse.json({ok:false,error:'다른 요청이 먼저 실행 중이거나 이미 처리된 승인입니다.'},{status:409})
  const p=claim.data.payload||{},action=text(p.export_action,20).toUpperCase(),targetId=text(p.target_id,140)
  try{const result=action==='DELETE'?await pcApi(request,`/api/moni/export-documents?id=${encodeURIComponent(targetId)}`,'DELETE'):await pcApi(request,'/api/moni/export-documents','PATCH',{id:targetId,action});const snapshot={verified:true,verification_basis:'CANONICAL_PC_EXPORT_DOCUMENT_API_SUCCESS',export_action:action,target_id:targetId,result};const done=await db.from('moni_action_confirmations').update({status:'EXECUTED',result_snapshot:snapshot,executed_at:new Date().toISOString(),error_message:null}).eq('id',row.id).eq('status','EXECUTING');if(done.error)throw new Error(done.error.message);await db.from('moni_action_audit_log').insert({confirmation_id:row.id,business_id:BUSINESS_ID,action_domain:'mobile_management_export_document',action_type:action==='DELETE'?'DELETE':'UPDATE',target_table:'export_documents',target_id:targetId,before_snapshot:claim.data.before_snapshot||null,after_snapshot:snapshot,actor_login_id:session.loginId,actor_role:session.role,source_client_id:`moni-mobile:${threadId}`,user_confirmation_text:'모바일 수출서류 관리에서 확정 실행'});return NextResponse.json({ok:true,result:snapshot},{headers:{'Cache-Control':'no-store'}})}catch(error){await db.from('moni_action_confirmations').update({status:'FAILED',error_message:text(error instanceof Error?error.message:'수출서류 처리 실패',1500)}).eq('id',row.id).eq('status','EXECUTING');throw error}
}

export async function GET(request: NextRequest) {
  const response=await v1GET(request);const payload=await response.clone().json().catch(()=>null) as Record<string,any>|null
  if(!payload?.ok||!payload.card||!['sales_statement_history','export_document_history','official_document_history'].includes(payload.card.domain))return response
  const threadId=text(request.nextUrl.searchParams.get('thread_id'),80);const session=await getSessionFromRequest(request);if(!session||!uuidLike(threadId))return response
  const latest=await latestUser(threadId,session.loginId).catch(()=>null);if(!latest||!/전체|모든/.test(text(latest.content,5000)))return response
  const card={...payload.card,filters:(payload.card.filters||[]).map((item:any)=>['from','to'].includes(item.key)?{...item,value:''}:item)}
  return NextResponse.json({...payload,card},{status:response.status,headers:{'Cache-Control':'no-store'}})
}

export async function POST(request: NextRequest) {
  const body=await request.clone().json().catch(()=>null) as Record<string,any>|null;const command=text(body?.command,30).toLowerCase()
  try{
    if(body&&command==='query'&&body.domain==='sales_statement_history')return await salesQuery(request,body)
    if(body&&command==='query'&&body.domain==='export_document_history')return await exportQuery(request,body)
    if(body&&command==='prepare_export'&&body.domain==='export_document_history')return await prepareExportAction(request,body)
    if(body&&command==='execute_export')return await executeExportAction(request,body)
    return v1POST(request)
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'모바일 관리 업무를 처리하지 못했습니다.'},{status:400,headers:{'Cache-Control':'no-store'}})}
}
