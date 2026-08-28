import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import {
  classifyMobileCapabilityV4Intent,
  isMobileCapabilityV4Write,
  type MobileCapabilityV4Domain,
  type MobileCapabilityV4Intent,
} from '@/lib/moni/mobile-capability-v4-intents'
import { analyzeDocument } from '@/app/audit/lib/analyzeDocument'
import { AUDIT_CATEGORY_META, isAuditCategory } from '@/app/audit/lib/prompts'
import { addAuditRecord, readAuditRecords, saveAuditFile } from '@/app/audit/lib/storage'
import type { AuditRecord } from '@/app/audit/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const ATTACHMENT_BUCKET = 'moni-ai-attachments'
const text = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
const thisMonth = () => today().slice(0, 7)
const monthStart = (value: unknown) => /^\d{4}-\d{2}$/.test(text(value, 7)) ? `${text(value, 7)}-01` : `${thisMonth()}-01`
const option = (value: unknown, label: unknown, sub = '') => ({ value: text(value, 200), label: text(label, 300), sub: text(sub, 500) })
const field = (key: string, label: string, type: string, value: unknown = '', extra: Record<string, unknown> = {}) => ({ key, label, type, value, ...extra })
const candidate = (id: unknown, label: unknown, values: Record<string, unknown> = {}) => ({ id: text(id, 200), label: text(label, 500), values })
const won = (value: unknown) => `${Math.round(num(value)).toLocaleString('ko-KR')}원`
const kg = (value: unknown) => `${(num(value) / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}kg`

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>
type Db = ReturnType<typeof createMoniServiceRoleClient>
type ResultCard = { title: string; lines: string[]; links?: Array<{ label: string; href: string }> }

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 이 업무를 실행할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

async function latestUser(db: Db, threadId: string, loginId: string) {
  const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', loginId).eq('status', 'ACTIVE').maybeSingle()
  if (thread.error) throw new Error(thread.error.message)
  if (!thread.data) return null
  const result = await db.from('moni_ai_messages').select('id,content,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('role', 'user').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (result.error) throw new Error(result.error.message)
  return result.data || null
}

async function pcApi(request: NextRequest, pathname: string, method = 'GET', body?: unknown) {
  const url = new URL(pathname, request.url)
  const headers: Record<string, string> = {}
  const cookie = request.headers.get('cookie')
  if (cookie) headers.cookie = cookie
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
  const payload = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok || payload.ok === false) throw new Error(text(payload.error, 1800) || `${pathname} 처리 실패 (${response.status})`)
  return payload
}

function actionDomain(domain: MobileCapabilityV4Domain) { return `mobile_capability_v4_${domain}` }
function semanticAction(intent: MobileCapabilityV4Intent) {
  if (intent.operation === 'CREATE') return 'CREATE'
  if (intent.operation === 'DELETE') return 'DELETE'
  return 'UPDATE'
}
function needsTarget(intent: MobileCapabilityV4Intent) {
  if (intent.domain === 'quality_management' && intent.operation === 'UPDATE') return true
  if (intent.domain === 'compliance_management' && intent.operation === 'RESOLVE') return true
  if (intent.domain === 'sales_accessory_charge') return true
  if (intent.domain === 'sales_tax_invoice' && intent.operation !== 'CREATE') return true
  if (intent.domain === 'hr_required_document' && intent.operation === 'DELETE') return true
  if (intent.domain === 'quote_management' && intent.operation !== 'CREATE' && intent.operation !== 'READ') return true
  return false
}

async function readyAttachments(db: Db, threadId: string) {
  const result = await db.from('moni_ai_attachments').select('id,file_name,mime_type,size_bytes,storage_path,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('upload_status', 'READY').order('created_at', { ascending: false }).limit(50)
  if (result.error) throw new Error(result.error.message)
  return result.data ?? []
}

async function buildCard(request: NextRequest, db: Db, threadId: string, sourceId: string, intent: MobileCapabilityV4Intent) {
  const base = { stage: 'draft', domain: intent.domain, operation: intent.operation, source_user_message_id: sourceId, schema: [] as any[], candidates: [] as any[], defaults: {} as Record<string, unknown>, warnings: [] as string[] }

  if (intent.domain === 'production_daily') {
    return { ...base, title: '생산일보', schema: [field('date', '조회일', 'date', today(), { required: true })] }
  }

  if (intent.domain === 'quality_management') {
    const rows = await db.from('production_records').select('id,lot_number,work_date,product_name,status,inspection_result,inspection_note,sanitation_check,defect_quantity_g,actual_quantity_g').eq('business_id', BUSINESS_ID).order('work_date', { ascending: false }).order('created_at', { ascending: false }).limit(80)
    if (rows.error) throw new Error(rows.error.message)
    if (intent.operation === 'READ') return { ...base, title: '품질관리', schema: [field('month', '조회월', 'month', thisMonth(), { required: true })] }
    return { ...base, title: '품질검사 결과 수정', schema: [field('inspection_result', '검사결과', 'select', '적합', { required: true, options: [option('적합','적합'), option('부적합','부적합'), option('조건부적합','조건부적합')] }), field('inspection_note','검사 메모','textarea',''), field('sanitation_check','위생 확인','checkbox',true)], candidates: (rows.data ?? []).map((row: any) => candidate(row.id, `${row.work_date} · ${row.product_name} · ${row.lot_number}`, row)) }
  }

  if (intent.domain === 'compliance_management') {
    const rows = await db.from('compliance_issues').select('*').in('business_id', [BUSINESS_ID, 'default']).order('created_at', { ascending: false }).limit(100)
    if (rows.error) throw new Error(rows.error.message)
    if (intent.operation === 'READ') return { ...base, title: '규정준수 관리' }
    return { ...base, title: '규정준수 이슈 조치완료', candidates: (rows.data ?? []).filter((row: any) => !row.is_resolved).map((row: any) => candidate(row.id, `${row.severity} · ${row.issue_type} · ${row.product_name || '-'}`, row)) }
  }

  if (intent.domain === 'sales_accessory_charge') {
    const rows = await db.from('sales_orders').select('id,statement_number,sale_date,client_id,total_amount,status,source_type,manual_client_name').eq('business_id', BUSINESS_ID).eq('status', 'confirmed').order('sale_date', { ascending: false }).order('created_at', { ascending: false }).limit(80)
    if (rows.error) throw new Error(rows.error.message)
    return { ...base, title: '판매 기타비용 추가', schema: [field('charge_name','비용 항목','text','택배비',{required:true}), field('quantity','수량','number','1',{required:true,step:'0.001'}), field('unit','단위','text','건',{required:true}), field('unit_price','단가(원)','number','',{required:true})], candidates: (rows.data ?? []).filter((row: any) => !['RETURN','CREDIT'].includes(text(row.source_type).toUpperCase())).map((row: any) => candidate(row.id, `${row.sale_date} · ${row.statement_number} · ${won(row.total_amount)}`, row)), warnings: ['기타비용은 거래금액·부가세·미수금에 반영되며 제품 재고와 판매수량에는 반영하지 않습니다.'] }
  }

  if (intent.domain === 'sales_tax_invoice') {
    if (intent.operation === 'READ') return { ...base, title: '세금계산서 관리' }
    if (intent.operation === 'CREATE') {
      const orders = await db.from('sales_orders').select('id,statement_number,sale_date,total_amount,client_id,manual_client_name,status,source_type').eq('business_id', BUSINESS_ID).eq('status', 'confirmed').order('sale_date', { ascending: false }).limit(100)
      if (orders.error) throw new Error(orders.error.message)
      return { ...base, title: '세금계산서 기록 생성', schema: [field('order_id','판매건','select','',{required:true,options:(orders.data ?? []).filter((row:any)=>!['RETURN','CREDIT'].includes(text(row.source_type).toUpperCase())).map((row:any)=>option(row.id,`${row.sale_date} · ${row.statement_number}`,won(row.total_amount)))}), field('invoice_number','세금계산서 번호','text',''), field('issue_date','발행일','date',today(),{required:true}), field('status','상태','select','issued',{options:[option('draft','발행대기'),option('issued','발행기록 완료')]}), field('note','메모','textarea','')], warnings: ['MONI는 세금계산서 발행·수취 기록을 관리합니다. 국세청 전자발행 전송은 별도 인증 사업자 연동이 필요합니다.'] }
    }
    const invoices = await db.from('moni_sales_tax_invoices').select('*').eq('business_id', BUSINESS_ID).order('issue_date', { ascending: false }).limit(100)
    if (invoices.error) throw new Error(invoices.error.message)
    return { ...base, title: '세금계산서 상태 변경', schema: [field('status','상태','select','cancelled',{options:[option('draft','발행대기'),option('issued','발행기록 완료'),option('cancelled','취소')]}),field('note','메모','textarea','')], candidates:(invoices.data ?? []).map((row:any)=>candidate(row.id,`${row.issue_date} · ${row.invoice_number} · ${row.recipient_name}`,row)) }
  }

  if (intent.domain === 'sales_commission_settlement' || intent.domain === 'freelancer_monthly_settlement') {
    return { ...base, title: intent.domain === 'sales_commission_settlement' ? '영업 수당 정산' : '월별 프리랜서 정산', schema: [field('month','정산월','month',thisMonth(),{required:true})], warnings: intent.operation === 'CREATE' ? ['PC 정산 엔진과 동일한 계산 기준으로 해당 월 정산을 다시 계산해 저장합니다.'] : [] }
  }

  if (intent.domain === 'settlement_print') {
    return { ...base, title: '정산서 출력', schema: [field('month','정산월','month',thisMonth(),{required:true})] }
  }

  if (intent.domain === 'hr_required_document') {
    const people = await db.from('business_people').select('id,name,person_type,status').eq('business_id', BUSINESS_ID).order('name')
    if (people.error) throw new Error(people.error.message)
    if (intent.operation === 'READ') return { ...base, title: '필수서류 관리' }
    if (intent.operation === 'DELETE') {
      const docs = await db.from('moni_hr_required_documents').select('*').eq('business_id', BUSINESS_ID).eq('status','active').order('created_at',{ascending:false}).limit(100)
      if (docs.error) throw new Error(docs.error.message)
      const byPerson = new Map((people.data ?? []).map((row:any)=>[row.id,row.name]))
      return { ...base,title:'필수서류 삭제',candidates:(docs.data ?? []).map((row:any)=>candidate(row.id,`${byPerson.get(row.person_id) || '인력'} · ${row.document_type}`,row)) }
    }
    const attachments = await readyAttachments(db, threadId)
    return { ...base, title: '필수서류 파일 등록', schema: [field('person_id','인력','select','',{required:true,options:(people.data ?? []).map((row:any)=>option(row.id,row.name,row.person_type))}), field('document_type','서류종류','select','contract',{required:true,options:[option('contract','계약서'),option('id','신분증'),option('bank','통장사본'),option('other','기타')]}), field('attachment_id','첨부파일','select',text(attachments[0]?.id),{required:true,options:attachments.map((row:any)=>option(row.id,row.file_name,`${Math.round(num(row.size_bytes)/1024)}KB`))}), field('expires_on','만료일','date',''), field('note','메모','textarea','')], warnings: attachments.length ? [] : ['먼저 모바일 MONI 입력창의 파일 첨부 기능으로 서류를 첨부해 주세요.'] }
  }

  if (intent.domain === 'quote_management') {
    if (intent.operation === 'READ') return { ...base, title: '견적서 관리' }
    const clients = await db.from('sales_clients').select('id,company_name,contact_name,status').eq('business_id',BUSINESS_ID).order('company_name')
    if (clients.error) throw new Error(clients.error.message)
    const schema = [field('quote_date','견적일','date',today(),{required:true}), field('valid_until','유효기간','date',''), field('client_id','거래처','select','',{options:[option('','직접 입력'),...(clients.data ?? []).map((row:any)=>option(row.id,row.company_name,row.contact_name||''))]}), field('client_name','거래처명','text','',{required:true}), field('contact_name','담당자','text',''), field('currency','통화','select','KRW',{options:[option('KRW','KRW'),option('USD','USD')]}), field('status','상태','select','draft',{options:[option('draft','작성중'),option('issued','발행'),option('sent','발송'),option('cancelled','취소')]}), field('vat_rate','VAT(%)','number','10',{required:true}), ...Array.from({length:5},(_,i)=>i+1).flatMap((i)=>[field(`item_${i}_name`,`${i}번 품목`,'text',''),field(`item_${i}_quantity`,`${i}번 수량`,'number','',{step:'0.001'}),field(`item_${i}_unit`,`${i}번 단위`,'text','EA'),field(`item_${i}_unit_price`,`${i}번 단가`,'number','')]), field('note','메모','textarea','')]
    if (intent.operation === 'CREATE') return { ...base,title:'견적서 작성',schema }
    const quotes = await db.from('moni_quotes').select('*').eq('business_id',BUSINESS_ID).order('quote_date',{ascending:false}).limit(100)
    if (quotes.error) throw new Error(quotes.error.message)
    return { ...base,title:intent.operation==='DELETE'?'견적서 취소':'견적서 수정',schema:intent.operation==='DELETE'?[]:schema,candidates:(quotes.data ?? []).map((row:any)=>candidate(row.id,`${row.quote_date} · ${row.quote_number} · ${row.client_name}`,quoteDefaults(row))) }
  }

  if (intent.domain === 'financial_audit') {
    if (intent.operation === 'READ') return { ...base,title:'재무감사' }
    const attachments = await readyAttachments(db, threadId)
    return { ...base,title:'재무감사 실행',schema:[field('category','감사 카테고리','select','tax',{required:true,options:Object.values(AUDIT_CATEGORY_META).map((row:any)=>option(row.key,row.label,row.description))}),field('attachment_id','분석 파일','select',text(attachments[0]?.id),{required:true,options:attachments.filter((row:any)=>['application/pdf','image/jpeg','image/png','image/webp'].includes(text(row.mime_type))).map((row:any)=>option(row.id,row.file_name))})],warnings:attachments.length?[]:['먼저 모바일 MONI 입력창에서 PDF 또는 이미지 증빙을 첨부해 주세요.'] }
  }

  if (intent.domain === 'audit_records') return { ...base,title:'감사 기록' }
  if (intent.domain === 'control_tower') return { ...base,title:'경영 Control Tower' }
  if (intent.domain === 'moni_intelligence') return { ...base,title:'MONI Intelligence',schema:[field('month','판정월','month',thisMonth(),{required:true})] }

  return null
}

function quoteDefaults(row: any) {
  const defaults: Record<string, unknown> = { quote_date: row.quote_date, valid_until: row.valid_until || '', client_id: row.client_id || '', client_name: row.client_name || '', contact_name: row.contact_name || '', currency: row.currency || 'KRW', status: row.status || 'draft', vat_rate: row.vat_rate ?? 10, note: row.note || '' }
  const items = Array.isArray(row.items) ? row.items : []
  items.slice(0,5).forEach((item:any,index:number)=>{const i=index+1;defaults[`item_${i}_name`]=item.name||'';defaults[`item_${i}_quantity`]=item.quantity??'';defaults[`item_${i}_unit`]=item.unit||'EA';defaults[`item_${i}_unit_price`]=item.unit_price??''})
  return defaults
}

async function readCapability(request: NextRequest, db: Db, intent: MobileCapabilityV4Intent, fields: Record<string, any>): Promise<ResultCard> {
  if (intent.domain === 'production_daily') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(text(fields.date,10)) ? text(fields.date,10) : today()
    const payload = await pcApi(request, `/api/moni/production-daily?date=${encodeURIComponent(date)}`)
    const rows = Array.isArray(payload.records) ? payload.records : Array.isArray(payload.production_records) ? payload.production_records : []
    const total = rows.reduce((sum:number,row:any)=>sum+num(row.actual_quantity_g),0)
    return { title:`${date} 생산일보`, lines:[`생산기록 ${rows.length}건`,`실제 생산량 ${kg(total)}`, ...rows.slice(0,8).map((row:any)=>`${row.product_name || '-'} · ${row.lot_number || '-'} · ${kg(row.actual_quantity_g)} · ${row.status || '-'}`)], links:[{label:'생산일보 화면',href:'/production-daily'}] }
  }

  if (intent.domain === 'quality_management') {
    const month = /^\d{4}-\d{2}$/.test(text(fields.month,7)) ? text(fields.month,7) : thisMonth()
    const start=`${month}-01`; const next=new Date(`${start}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth()+1); const end=new Date(next.getTime()-86400000).toISOString().slice(0,10)
    const rows = await db.from('production_records').select('work_date,product_name,lot_number,actual_quantity_g,defect_quantity_g,inspection_result,inspection_note,sanitation_check,status').eq('business_id',BUSINESS_ID).gte('work_date',start).lte('work_date',end).order('work_date',{ascending:false}).limit(300)
    if(rows.error)throw new Error(rows.error.message)
    const data=rows.data??[]; const defect=data.reduce((sum:any,row:any)=>sum+num(row.defect_quantity_g),0); const bad=data.filter((row:any)=>text(row.inspection_result)&&!/(적합|pass|ok)/i.test(text(row.inspection_result)))
    return {title:`${month} 품질관리`,lines:[`생산기록 ${data.length}건`,`불량량 ${kg(defect)}`,`검사 주의/부적합 ${bad.length}건`,`위생 미확인 ${data.filter((row:any)=>row.sanitation_check===false).length}건`,...bad.slice(0,8).map((row:any)=>`${row.work_date} · ${row.product_name} · ${row.lot_number} · ${row.inspection_result}`)]}
  }

  if (intent.domain === 'compliance_management') {
    const rows=await db.from('compliance_issues').select('*').in('business_id',[BUSINESS_ID,'default']).order('created_at',{ascending:false}).limit(100)
    if(rows.error)throw new Error(rows.error.message)
    const data=rows.data??[]; const open=data.filter((row:any)=>!row.is_resolved)
    return {title:'규정준수 관리',lines:[`전체 이슈 ${data.length}건`,`미해결 ${open.length}건`,...open.slice(0,10).map((row:any)=>`${row.severity} · ${row.issue_type} · ${row.product_name || '-'} · ${row.detail || ''}`)]}
  }

  if (intent.domain === 'sales_tax_invoice') {
    const rows=await db.from('moni_sales_tax_invoices').select('*').eq('business_id',BUSINESS_ID).order('issue_date',{ascending:false}).limit(50)
    if(rows.error)throw new Error(rows.error.message)
    return {title:'세금계산서 관리',lines:[`등록 ${rows.data?.length ?? 0}건`,...(rows.data??[]).slice(0,12).map((row:any)=>`${row.issue_date} · ${row.invoice_number} · ${row.recipient_name} · ${won(row.total_amount)} · ${row.status}`)]}
  }

  if (intent.domain === 'sales_commission_settlement' || intent.domain === 'freelancer_monthly_settlement') {
    const month=/^\d{4}-\d{2}$/.test(text(fields.month,7))?text(fields.month,7):thisMonth()
    const payload=await pcApi(request,`/api/moni/business-management?month=${encodeURIComponent(month)}`)
    let rows=Array.isArray(payload.settlement_preview)?payload.settlement_preview:[]
    if(intent.domain==='sales_commission_settlement')rows=rows.filter((row:any)=>row.source_type==='sales')
    return {title:intent.domain==='sales_commission_settlement'?`${month} 영업 수당 정산`:`${month} 프리랜서 정산`,lines:[`대상 ${rows.length}명`,`총 지급예정 ${won(rows.reduce((sum:number,row:any)=>sum+num(row.net_amount),0))}`,...rows.slice(0,15).map((row:any)=>`${row.person_name} · 총액 ${won(row.gross_amount)} · 원천 ${won(row.withholding_amount)} · 지급 ${won(row.net_amount)}${row.saved?` · ${row.saved.status}`:' · 미저장'}`)]}
  }

  if (intent.domain === 'settlement_print') {
    const month=/^\d{4}-\d{2}$/.test(text(fields.month,7))?text(fields.month,7):thisMonth(); const start=monthStart(month)
    const [rows,people]=await Promise.all([db.from('freelancer_settlements').select('*').eq('business_id',BUSINESS_ID).eq('settlement_month',start).order('source_type'),db.from('business_people').select('id,name').eq('business_id',BUSINESS_ID)])
    if(rows.error)throw new Error(rows.error.message); if(people.error)throw new Error(people.error.message); const names=new Map((people.data??[]).map((row:any)=>[row.id,row.name]))
    return {title:`${month} 정산서 출력`,lines:[`저장된 정산 ${rows.data?.length ?? 0}건`,...(rows.data??[]).map((row:any)=>`${names.get(row.person_id)||'인력'} · ${row.source_type} · ${won(row.net_amount)} · ${row.status}`)],links:[{label:'정산서 인쇄/PDF',href:`/api/moni/mobile-settlement-print?month=${encodeURIComponent(month)}`}]}
  }

  if (intent.domain === 'hr_required_document') {
    const [docs,people]=await Promise.all([db.from('moni_hr_required_documents').select('*').eq('business_id',BUSINESS_ID).neq('status','deleted').order('created_at',{ascending:false}).limit(100),db.from('business_people').select('id,name').eq('business_id',BUSINESS_ID)])
    if(docs.error)throw new Error(docs.error.message); if(people.error)throw new Error(people.error.message); const names=new Map((people.data??[]).map((row:any)=>[row.id,row.name])); const attachments=await readyAttachments(db,text(fields.thread_id,80))
    const attachmentById=new Map(attachments.map((row:any)=>[row.id,row])); const links:Array<{label:string;href:string}>=[]
    for(const row of docs.data??[]){const att=attachmentById.get(row.attachment_id);if(att){const signed=await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(att.storage_path,600);if(signed.data?.signedUrl)links.push({label:`${names.get(row.person_id)||'인력'} ${row.document_type}`,href:signed.data.signedUrl})}}
    return {title:'필수서류 관리',lines:[`등록 서류 ${docs.data?.length ?? 0}건`,...(docs.data??[]).slice(0,15).map((row:any)=>`${names.get(row.person_id)||'인력'} · ${row.document_type} · ${row.status}${row.expires_on?` · 만료 ${row.expires_on}`:''}`)],links:links.slice(0,10)}
  }

  if (intent.domain === 'quote_management') {
    const rows=await db.from('moni_quotes').select('*').eq('business_id',BUSINESS_ID).order('quote_date',{ascending:false}).limit(50); if(rows.error)throw new Error(rows.error.message)
    return {title:'견적서 관리',lines:[`견적서 ${rows.data?.length ?? 0}건`,...(rows.data??[]).slice(0,12).map((row:any)=>`${row.quote_date} · ${row.quote_number} · ${row.client_name} · ${won(row.total_amount)} · ${row.status}`)]}
  }

  if (intent.domain === 'financial_audit' || intent.domain === 'audit_records') {
    const records=await readAuditRecords(); return {title:'재무감사 기록',lines:[`감사 기록 ${records.length}건`,...records.slice(0,12).map((row:any)=>`${row.createdAt.slice(0,10)} · ${row.categoryLabel} · ${row.status} · ${row.files.length}개 파일`)],links:[{label:'재무감사 전체 화면',href:'/audit'}]}
  }

  if (intent.domain === 'control_tower') {
    const month=thisMonth(); const [sales,production,receivables,targets,finance]=await Promise.all([pcApi(request,`/api/moni/sales-operations?month=${month}`),pcApi(request,'/api/moni/production-dashboard'),pcApi(request,'/api/moni/receivables'),pcApi(request,`/api/moni/sales-targets?month=${month}`),pcApi(request,`/api/moni/financial-control?month=${month}`)])
    return {title:'경영 Control Tower',lines:[`이번 달 매출 ${won(sales.summary?.total_amount)}`,`현재 미수금 ${won(receivables.summary?.outstanding_amount)}`,`연체 ${receivables.summary?.overdue_count ?? 0}건 · ${won(receivables.summary?.overdue_amount)}`,`월 목표 달성률 ${num(targets.company?.attainment_rate).toFixed(1)}%`,`순현금증감 ${won(finance.summary?.actual_net_movement)}`,`생산 달성률 ${num(production.kpis?.production?.attainment_rate).toFixed(1)}%`,`생산 위험 작업 ${production.kpis?.risk?.risk_work_orders ?? 0}건`],links:[{label:'Control Tower 전체 화면',href:'/'}]}
  }

  if (intent.domain === 'moni_intelligence') {
    const month=/^\d{4}-\d{2}$/.test(text(fields.month,7))?text(fields.month,7):thisMonth(); const payload=await pcApi(request,`/api/moni/intelligence?month=${encodeURIComponent(month)}`); const top=payload.top_action
    return {title:`${month} MONI Intelligence`,lines:[`즉시 조치 ${payload.counts?.critical ?? 0} · 높은 우선순위 ${payload.counts?.high ?? 0} · 주의 ${payload.counts?.attention ?? 0} · 데이터 보완 ${payload.counts?.data ?? 0}`,...(top?[`TOP ACTION · ${top.title}`,top.summary,...(top.evidence||[]).slice(0,4)]:['현재 최우선 조치 항목이 없습니다.']),...(Array.isArray(payload.items)?payload.items.slice(0,6).map((row:any)=>`${row.title} · ${row.action}`):[])],links:[{label:'Intelligence 전체 화면',href:'/?moni_view=intelligence'}]}
  }

  return {title:'MONI',lines:['조회 결과가 없습니다.']}
}

async function beforeSnapshot(db: Db, intent: MobileCapabilityV4Intent, targetId: string) {
  if (!targetId) return null
  const table = intent.domain === 'quality_management' ? 'production_records'
    : intent.domain === 'compliance_management' ? 'compliance_issues'
      : intent.domain === 'sales_accessory_charge' ? 'sales_orders'
        : intent.domain === 'sales_tax_invoice' ? 'moni_sales_tax_invoices'
          : intent.domain === 'hr_required_document' ? 'moni_hr_required_documents'
            : intent.domain === 'quote_management' ? 'moni_quotes' : ''
  if (!table) return null
  let query=db.from(table).select('*').eq('id',targetId)
  if(table!=='compliance_issues')query=query.eq('business_id',BUSINESS_ID)
  const result=await query.maybeSingle(); if(result.error)throw new Error(result.error.message); return result.data||null
}

async function prepareWrite(session: SessionUser, body: Record<string, any>) {
  const threadId=text(body.thread_id,80),sourceId=text(body.source_user_message_id,80),targetId=text(body.target_id,100)
  if(!uuidLike(threadId)||!uuidLike(sourceId))throw new Error('현재 대화의 입력 카드를 확인할 수 없습니다.')
  const db=createMoniServiceRoleClient(); const latest=await latestUser(db,threadId,session.loginId); if(!latest||text(latest.id,100)!==sourceId)throw new Error('현재 대화의 최신 요청과 입력 카드가 일치하지 않습니다.')
  const intent=classifyMobileCapabilityV4Intent(latest.content); if(!intent||intent.domain!==body.domain||intent.operation!==body.operation||!isMobileCapabilityV4Write(intent))throw new Error('현재 요청의 업무 종류가 입력 카드와 일치하지 않습니다.')
  if(needsTarget(intent)&&!targetId)throw new Error('처리할 기존 기록을 먼저 선택해 주세요.')
  const fields=body.fields&&typeof body.fields==='object'?body.fields:{}
  const old=await db.from('moni_action_confirmations').select('id').eq('business_id',BUSINESS_ID).eq('requested_by_login_id',session.loginId).eq('source_client_id',`moni-mobile:${threadId}`).eq('status','PENDING').limit(30); if(old.error)throw new Error(old.error.message); if((old.data??[]).length)await db.from('moni_action_confirmations').update({status:'CANCELLED'}).in('id',(old.data??[]).map((row:any)=>row.id)).eq('status','PENDING')
  const before=await beforeSnapshot(db,intent,targetId)
  const confirmation=await db.from('moni_action_confirmations').insert({business_id:BUSINESS_ID,action_domain:actionDomain(intent.domain),action_type:semanticAction(intent),target_id:uuidLike(targetId)?targetId:null,payload:{domain:intent.domain,semantic_operation:intent.operation,fields,target_id:targetId||null,source_user_message_id:sourceId},before_snapshot:before,preview_text:`[${intent.domain}] 입력 내용을 실행 전 최종 확인합니다.`,warnings:['확정 실행 후 공식 업무 데이터에 반영됩니다.'],status:'PENDING',requested_by_login_id:session.loginId,requested_by_role:session.role,source_client_id:`moni-mobile:${threadId}`,expires_at:new Date(Date.now()+15*60_000).toISOString()}).select('id,status,preview_text,warnings,expires_at').single()
  if(confirmation.error)throw new Error(confirmation.error.message); return confirmation.data
}

async function nextNumber(db:Db,table:string,column:string,prefix:string){const result=await db.from(table).select(column).eq('business_id',BUSINESS_ID).like(column,`${prefix}%`).order(column,{ascending:false}).limit(1);if(result.error)throw new Error(result.error.message);const latest=text((result.data?.[0] as any)?.[column]);const n=latest.startsWith(prefix)?Number(latest.slice(prefix.length))+1:1;return `${prefix}${String(Number.isFinite(n)?n:1).padStart(3,'0')}`}

async function executeWrite(request:NextRequest,session:SessionUser,threadId:string,row:any) {
  const db=createMoniServiceRoleClient(); if(row.status==='EXECUTED')return row.result_snapshot||{verified:true,duplicate_safe:true}; if(row.status!=='PENDING')throw new Error(`현재 승인 상태(${row.status})에서는 실행할 수 없습니다.`); if(new Date(row.expires_at).getTime()<Date.now()){await db.from('moni_action_confirmations').update({status:'EXPIRED'}).eq('id',row.id).eq('status','PENDING');throw new Error('승인 시간이 만료되었습니다. 입력 카드를 다시 열어 주세요.')}
  const claim=await db.from('moni_action_confirmations').update({status:'EXECUTING',user_confirmation_text:'모바일 입력 카드에서 확정 실행'}).eq('id',row.id).eq('status','PENDING').select('*').maybeSingle(); if(claim.error)throw new Error(claim.error.message); if(!claim.data)throw new Error('다른 요청이 먼저 실행 중이거나 이미 처리된 승인입니다.')
  const p=claim.data.payload||{},domain=text(p.domain,80) as MobileCapabilityV4Domain,op=text(p.semantic_operation,40),targetId=text(p.target_id,100),f=p.fields||{}
  try{
    let result:any
    if(domain==='quality_management'){
      const updated=await db.from('production_records').update({inspection_result:text(f.inspection_result,80),inspection_note:text(f.inspection_note,1000)||null,sanitation_check:Boolean(f.sanitation_check),updated_at:new Date().toISOString()}).eq('id',targetId).eq('business_id',BUSINESS_ID).select('id,lot_number,work_date,product_name,inspection_result,inspection_note,sanitation_check').single(); if(updated.error)throw new Error(updated.error.message); result=updated.data
    } else if(domain==='compliance_management'){
      const updated=await db.from('compliance_issues').update({is_resolved:true,resolved_at:new Date().toISOString()}).eq('id',targetId).select('*').single(); if(updated.error)throw new Error(updated.error.message); result=updated.data
    } else if(domain==='sales_accessory_charge'){
      const order=await db.from('sales_orders').select('*').eq('id',targetId).eq('business_id',BUSINESS_ID).single(); if(order.error)throw new Error(order.error.message)
      const items=await db.from('sales_order_items').select('*').eq('order_id',targetId).order('sort_order'); if(items.error)throw new Error(items.error.message)
      const productItems=(items.data??[]).filter((item:any)=>text(item.sales_variant_id)).map((item:any)=>({sales_variant_id:item.sales_variant_id,quantity:num(item.quantity),unit_price:num(item.unit_price)}))
      const existing=(items.data??[]).filter((item:any)=>!text(item.product_id)&&!text(item.sales_variant_id)&&text(item.specification)==='기타비용').map((item:any)=>({product_name:item.product_name,quantity:num(item.quantity),unit:item.unit,unit_price:num(item.unit_price)}))
      result=await pcApi(request,'/api/moni/sales-orders-v6','POST',{action:'save_order',id:targetId,data:{sale_date:order.data.sale_date,client_id:order.data.client_id,assigned_person_id:order.data.assigned_person_id,status:order.data.status,payment_status:order.data.payment_status,vat_rate:order.data.vat_rate,note:order.data.note,items:productItems,extra_items:[...existing,{product_name:text(f.charge_name,160),quantity:num(f.quantity),unit:text(f.unit,40)||'건',unit_price:num(f.unit_price)}]}})
    } else if(domain==='sales_tax_invoice'){
      if(op==='CREATE'){
        const order=await db.from('sales_orders').select('*').eq('id',text(f.order_id,80)).eq('business_id',BUSINESS_ID).single(); if(order.error)throw new Error(order.error.message)
        const client=order.data.client_id?await db.from('sales_clients').select('company_name,business_registration_number').eq('id',order.data.client_id).maybeSingle():{data:null,error:null}; if(client.error)throw new Error(client.error.message)
        const issueDate=text(f.issue_date,10)||today(); const invoiceNumber=text(f.invoice_number,80)||await nextNumber(db,'moni_sales_tax_invoices','invoice_number',`TAX-${issueDate.replaceAll('-','')}-`)
        const inserted=await db.from('moni_sales_tax_invoices').insert({business_id:BUSINESS_ID,order_id:order.data.id,invoice_number:invoiceNumber,issue_date:issueDate,status:['draft','issued'].includes(text(f.status,20))?text(f.status,20):'issued',recipient_name:text(client.data?.company_name||order.data.manual_client_name,300),business_registration_number:text(client.data?.business_registration_number,80),supply_amount:num(order.data.supply_amount),vat_amount:num(order.data.vat_amount),total_amount:num(order.data.total_amount),note:text(f.note,1000)||null}).select('*').single(); if(inserted.error)throw new Error(inserted.error.message); result=inserted.data
      } else {const updated=await db.from('moni_sales_tax_invoices').update({status:['draft','issued','cancelled'].includes(text(f.status,20))?text(f.status,20):'cancelled',note:text(f.note,1000)||null,updated_at:new Date().toISOString()}).eq('id',targetId).eq('business_id',BUSINESS_ID).select('*').single();if(updated.error)throw new Error(updated.error.message);result=updated.data}
    } else if(domain==='sales_commission_settlement'||domain==='freelancer_monthly_settlement'){
      const month=/^\d{4}-\d{2}$/.test(text(f.month,7))?text(f.month,7):thisMonth(); result=await pcApi(request,'/api/moni/business-management','POST',{action:'save_settlements',month})
    } else if(domain==='hr_required_document'){
      if(op==='CREATE'){
        const attachment=await db.from('moni_ai_attachments').select('id,thread_id,upload_status').eq('id',text(f.attachment_id,80)).eq('business_id',BUSINESS_ID).eq('thread_id',threadId).eq('upload_status','READY').maybeSingle();if(attachment.error)throw new Error(attachment.error.message);if(!attachment.data)throw new Error('현재 대화에 첨부된 파일을 확인할 수 없습니다.')
        const inserted=await db.from('moni_hr_required_documents').insert({business_id:BUSINESS_ID,person_id:text(f.person_id,80),document_type:text(f.document_type,80),attachment_id:attachment.data.id,status:'active',expires_on:text(f.expires_on,10)||null,note:text(f.note,1000)||null}).select('*').single();if(inserted.error)throw new Error(inserted.error.message)
        const readyField=text(f.document_type)==='contract'?'contract_document_ready':text(f.document_type)==='id'?'id_document_ready':text(f.document_type)==='bank'?'bank_document_ready':''; if(readyField){const person=await db.from('business_people').update({[readyField]:true,updated_at:new Date().toISOString()}).eq('id',text(f.person_id,80)).eq('business_id',BUSINESS_ID);if(person.error)throw new Error(person.error.message)} result=inserted.data
      } else {const doc=await db.from('moni_hr_required_documents').update({status:'deleted',updated_at:new Date().toISOString()}).eq('id',targetId).eq('business_id',BUSINESS_ID).select('*').single();if(doc.error)throw new Error(doc.error.message);result=doc.data}
    } else if(domain==='quote_management'){
      if(op==='DELETE'){const updated=await db.from('moni_quotes').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',targetId).eq('business_id',BUSINESS_ID).select('*').single();if(updated.error)throw new Error(updated.error.message);result=updated.data}
      else {const items=Array.from({length:5},(_,index)=>{const i=index+1;const name=text(f[`item_${i}_name`],300);const quantity=num(f[`item_${i}_quantity`]);const unitPrice=num(f[`item_${i}_unit_price`]);return name&&quantity>0?{name,quantity,unit:text(f[`item_${i}_unit`],40)||'EA',unit_price:unitPrice,supply_amount:money(quantity*unitPrice)}:null}).filter(Boolean) as any[];if(!items.length)throw new Error('견적 품목을 한 개 이상 입력해 주세요.')
        let clientName=text(f.client_name,300),contactName=text(f.contact_name,200);if(uuidLike(f.client_id)){const client=await db.from('sales_clients').select('company_name,contact_name').eq('id',text(f.client_id,80)).eq('business_id',BUSINESS_ID).maybeSingle();if(client.error)throw new Error(client.error.message);clientName=text(client.data?.company_name||clientName,300);contactName=text(client.data?.contact_name||contactName,200)}if(!clientName)throw new Error('거래처명을 입력해 주세요.')
        const supply=money(items.reduce((sum,row)=>sum+num(row.supply_amount),0)),vatRate=Math.max(0,num(f.vat_rate)),vat=money(supply*vatRate/100),total=money(supply+vat),quoteDate=text(f.quote_date,10)||today();const payload={business_id:BUSINESS_ID,quote_date:quoteDate,valid_until:text(f.valid_until,10)||null,client_id:uuidLike(f.client_id)?text(f.client_id,80):null,client_name:clientName,contact_name:contactName,currency:['KRW','USD'].includes(text(f.currency,10))?text(f.currency,10):'KRW',status:['draft','issued','sent','cancelled'].includes(text(f.status,20))?text(f.status,20):'draft',vat_rate:vatRate,items,supply_amount:supply,vat_amount:vat,total_amount:total,note:text(f.note,1000)||null,updated_at:new Date().toISOString()}
        if(op==='CREATE'){const quoteNumber=await nextNumber(db,'moni_quotes','quote_number',`Q-${quoteDate.replaceAll('-','')}-`);const inserted=await db.from('moni_quotes').insert({...payload,quote_number:quoteNumber}).select('*').single();if(inserted.error)throw new Error(inserted.error.message);result=inserted.data}else{const updated=await db.from('moni_quotes').update(payload).eq('id',targetId).eq('business_id',BUSINESS_ID).select('*').single();if(updated.error)throw new Error(updated.error.message);result=updated.data}
      }
    } else if(domain==='financial_audit'){
      if(!isAuditCategory(f.category))throw new Error('감사 카테고리를 확인해 주세요.');const attachment=await db.from('moni_ai_attachments').select('*').eq('id',text(f.attachment_id,80)).eq('thread_id',threadId).eq('business_id',BUSINESS_ID).eq('upload_status','READY').maybeSingle();if(attachment.error)throw new Error(attachment.error.message);if(!attachment.data)throw new Error('분석할 첨부파일을 확인할 수 없습니다.')
      const downloaded=await db.storage.from(ATTACHMENT_BUCKET).download(attachment.data.storage_path);if(downloaded.error||!downloaded.data)throw new Error(downloaded.error?.message||'첨부파일을 불러오지 못했습니다.');const buffer=Buffer.from(await downloaded.data.arrayBuffer());const mime=text(attachment.data.mime_type,180);if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(mime))throw new Error('재무감사는 PDF/JPG/PNG/WEBP 파일만 분석할 수 있습니다.')
      const analyzed=await analyzeDocument({category:f.category,files:[{name:attachment.data.file_name,mimeType:mime,base64:buffer.toString('base64')}]});const recordId=randomUUID(),ext=path.extname(attachment.data.file_name).toLowerCase().replace(/[^.a-z0-9]/g,'')|| (mime==='application/pdf'?'.pdf':mime==='image/png'?'.png':'.jpg'),storedName=`${randomUUID()}${ext}`;await saveAuditFile({recordId,storedName,buffer,mimeType:mime});const record:AuditRecord={id:recordId,category:f.category,categoryLabel:AUDIT_CATEGORY_META[f.category].label,status:'completed',result:analyzed.text,model:analyzed.model,createdAt:new Date().toISOString(),files:[{id:randomUUID(),category:f.category,originalName:attachment.data.file_name,storedName,size:buffer.length,mimeType:mime,uploadedAt:new Date().toISOString()}]};await addAuditRecord(record);result={record_id:record.id,category:record.category,category_label:record.categoryLabel,result:record.result,model:record.model}
    } else throw new Error('지원하지 않는 V4 실행 업무입니다.')
    const snapshot={verified:true,verification_basis:'CANONICAL_MOBILE_V4_SUCCESS',domain,operation:op,target_id:targetId||null,result};const done=await db.from('moni_action_confirmations').update({status:'EXECUTED',result_snapshot:snapshot,executed_at:new Date().toISOString(),error_message:null}).eq('id',row.id).eq('status','EXECUTING');if(done.error)throw new Error(done.error.message);await db.from('moni_action_audit_log').insert({confirmation_id:row.id,business_id:BUSINESS_ID,action_domain:actionDomain(domain),action_type:semanticAction({domain,operation:op} as any),target_table:domain,target_id:uuidLike(targetId)?targetId:null,before_snapshot:claim.data.before_snapshot||null,after_snapshot:snapshot,actor_login_id:session.loginId,actor_role:session.role,source_client_id:`moni-mobile:${threadId}`,user_confirmation_text:'모바일 입력 카드에서 확정 실행'});return snapshot
  }catch(error){const message=error instanceof Error?error.message:'V4 업무 실행 실패';await db.from('moni_action_confirmations').update({status:'FAILED',error_message:text(message,1800)}).eq('id',row.id).eq('status','EXECUTING');throw error}
}

export async function GET(request:NextRequest){const auth=await requireAdmin(request);if(auth.response||!auth.session)return auth.response!;const threadId=text(request.nextUrl.searchParams.get('thread_id'),80);if(!uuidLike(threadId))return NextResponse.json({ok:true,card:null},{headers:{'Cache-Control':'no-store'}});try{const db=createMoniServiceRoleClient(),latest=await latestUser(db,threadId,auth.session.loginId);if(!latest)return NextResponse.json({ok:true,card:null},{headers:{'Cache-Control':'no-store'}});const intent=classifyMobileCapabilityV4Intent(latest.content);if(!intent)return NextResponse.json({ok:true,card:null},{headers:{'Cache-Control':'no-store'}});const card=await buildCard(request,db,threadId,text(latest.id,80),intent);return NextResponse.json({ok:true,card},{headers:{'Cache-Control':'no-store'}})}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'V4 카드 생성 실패'},{status:500,headers:{'Cache-Control':'no-store'}})}}

export async function POST(request:NextRequest){const auth=await requireAdmin(request);if(auth.response||!auth.session)return auth.response!;const body=await request.json().catch(()=>null) as Record<string,any>|null;if(!body)return NextResponse.json({ok:false,error:'요청 본문이 필요합니다.'},{status:400});const command=text(body.command,30),threadId=text(body.thread_id,80);try{if(command==='read'){if(!uuidLike(threadId))throw new Error('현재 대화방을 확인할 수 없습니다.');const db=createMoniServiceRoleClient(),latest=await latestUser(db,threadId,auth.session.loginId);if(!latest||text(latest.id,80)!==text(body.source_user_message_id,80))throw new Error('현재 최신 질문과 조회 카드가 일치하지 않습니다.');const intent=classifyMobileCapabilityV4Intent(latest.content);if(!intent||intent.domain!==body.domain||intent.operation!=='READ')throw new Error('현재 질문의 조회 종류가 카드와 일치하지 않습니다.');const fields={...(body.fields||{}),thread_id:threadId};const result=await readCapability(request,db,intent,fields);return NextResponse.json({ok:true,result},{headers:{'Cache-Control':'no-store'}})}if(command==='prepare'){const confirmation=await prepareWrite(auth.session,body);return NextResponse.json({ok:true,confirmation},{headers:{'Cache-Control':'no-store'}})}if(command==='execute'){if(!uuidLike(threadId)||!uuidLike(body.confirmation_id))throw new Error('승인 정보를 확인할 수 없습니다.');const db=createMoniServiceRoleClient();const confirmation=await db.from('moni_action_confirmations').select('*').eq('id',text(body.confirmation_id,80)).eq('business_id',BUSINESS_ID).eq('requested_by_login_id',auth.session.loginId).eq('source_client_id',`moni-mobile:${threadId}`).maybeSingle();if(confirmation.error)throw new Error(confirmation.error.message);if(!confirmation.data||!text(confirmation.data.action_domain).startsWith('mobile_capability_v4_'))throw new Error('V4 승인 정보를 확인할 수 없습니다.');const result=await executeWrite(request,auth.session,threadId,confirmation.data);return NextResponse.json({ok:true,result},{headers:{'Cache-Control':'no-store'}})}return NextResponse.json({ok:false,error:'지원하지 않는 작업입니다.'},{status:400})}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'V4 업무 처리 실패'},{status:400,headers:{'Cache-Control':'no-store'}})}}
