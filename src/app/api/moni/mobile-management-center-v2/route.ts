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
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 10))
const safeSearch = (value: unknown) => text(value, 80).replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim()
const statusLabel = (value: unknown) => ({DRAFT:'작성중',GENERATED:'생성',SHIPPED:'출고',CANCELLED:'취소'}[text(value).toUpperCase()] || text(value) || '-')

async function latestUser(threadId: string, loginId: string) {
  const db=createMoniServiceRoleClient()
  const thread=await db.from('moni_ai_threads').select('id').eq('id',threadId).eq('business_id',BUSINESS_ID).eq('user_login_id',loginId).eq('status','ACTIVE').maybeSingle()
  if(thread.error)throw new Error(thread.error.message); if(!thread.data)throw new Error('현재 MONI 대화방을 확인할 수 없습니다.')
  const rows=await db.from('moni_ai_messages').select('id,role,content').eq('business_id',BUSINESS_ID).eq('thread_id',threadId).order('created_at',{ascending:false}).limit(14)
  if(rows.error)throw new Error(rows.error.message)
  return (rows.data??[]).find((row:any)=>row.role==='user')||null
}

async function exportQuery(request: NextRequest, body: Record<string,any>) {
  const session=await getSessionFromRequest(request)
  if(!session)return NextResponse.json({ok:false,error:'로그인이 필요합니다.'},{status:401})
  if(session.role!=='admin')return NextResponse.json({ok:false,error:'관리자만 이 업무를 사용할 수 있습니다.'},{status:403})
  const threadId=text(body.thread_id,80),sourceId=text(body.source_user_message_id,80)
  if(!uuidLike(threadId)||!uuidLike(sourceId))return NextResponse.json({ok:false,error:'현재 대화의 관리 요청을 확인할 수 없습니다.'},{status:400})
  const latest=await latestUser(threadId,session.loginId)
  const intent=latest?classifyMobileManagementCenterIntent(latest.content):null
  if(!latest||text(latest.id,80)!==sourceId||intent?.domain!=='export_document_history')return NextResponse.json({ok:false,error:'현재 대화의 최신 수출서류 관리 요청과 카드가 일치하지 않습니다.'},{status:409})

  const filters=body.filters&&typeof body.filters==='object'?body.filters:{}
  const from=validDate(filters.from)?text(filters.from,10):'',to=validDate(filters.to)?text(filters.to,10):''
  if(from&&to&&from>to)return NextResponse.json({ok:false,error:'시작일은 종료일보다 늦을 수 없습니다.'},{status:400})
  const page=Math.max(1,Math.min(100,Math.floor(num(filters.page))||1)),q=safeSearch(filters.q),status=text(filters.status,30).toUpperCase()
  const db=createMoniServiceRoleClient()
  let destinationIds:string[]=[]
  if(q){const destinations=await db.from('export_destinations').select('id').or(`company_name.ilike.%${q}%,country.ilike.%${q}%`).limit(100);if(destinations.error)throw new Error(destinations.error.message);destinationIds=(destinations.data??[]).map((row:any)=>text(row.id,100)).filter(Boolean)}
  let query=db.from('export_documents').select('id,document_date,status,invoice_no,packing_list_no,consignee_id,consignee_snapshot,bill_to,incoterm,final_destination,sales_order_id,created_at',{count:'exact'})
  if(from)query=query.gte('document_date',from);if(to)query=query.lte('document_date',to);if(status)query=query.eq('status',status)
  if(q){const base=`invoice_no.ilike.%${q}%,packing_list_no.ilike.%${q}%,bill_to.ilike.%${q}%,final_destination.ilike.%${q}%`;query=destinationIds.length?query.or(`${base},consignee_id.in.(${destinationIds.join(',')})`):query.or(base)}
  const start=(page-1)*PAGE_SIZE
  const found=await query.order('document_date',{ascending:false}).order('created_at',{ascending:false}).range(start,start+PAGE_SIZE-1)
  if(found.error)throw new Error(found.error.message)
  const rows=(found.data??[]).map((row:any)=>{const snap=row.consignee_snapshot&&typeof row.consignee_snapshot==='object'?row.consignee_snapshot:{};const consignee=text(snap.company_name||snap.country||row.bill_to)||'수출처 미확인';return {id:row.id,title:row.invoice_no||'Commercial Invoice',subtitle:`${row.document_date||'-'} · ${consignee}`,meta:`${row.packing_list_no||'Packing List 번호 없음'}${row.incoterm?` · ${row.incoterm}`:''}${row.final_destination?` · ${row.final_destination}`:''}`,badges:[statusLabel(row.status)],links:[{label:'Invoice / Packing List',href:`/sales-management/export/documents/${encodeURIComponent(row.id)}/print`},{label:'연결 거래명세표',href:`/sales-management/export/documents/${encodeURIComponent(row.id)}/statement`}]} })
  return NextResponse.json({ok:true,result:{title:'수출서류 전체 이력',page,page_size:PAGE_SIZE,total:found.count??rows.length,rows}},{headers:{'Cache-Control':'no-store'}})
}

export async function GET(request: NextRequest) { return v1GET(request) }
export async function POST(request: NextRequest) {
  const body=await request.clone().json().catch(()=>null) as Record<string,any>|null
  if(body&&text(body.command,30).toLowerCase()==='query'&&body.domain==='export_document_history'){
    try{return await exportQuery(request,body)}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'수출서류 이력을 조회하지 못했습니다.'},{status:400,headers:{'Cache-Control':'no-store'}})}
  }
  return v1POST(request)
}
