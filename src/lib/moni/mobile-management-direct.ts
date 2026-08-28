import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileManagementCenterIntent, mobileManagementCenterText } from '@/lib/moni/mobile-management-center-intents'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const RUNTIME = 'MONI_MOBILE_MANAGEMENT_CENTER_V1'
const text = (value: unknown, max = 6000) => String(value ?? '').trim().slice(0, max)

function safePage(raw: any) {
  return {
    pathname: text(raw?.pathname, 300),
    search: text(raw?.search, 500),
    title: text(raw?.title, 160),
    headings: Array.isArray(raw?.headings) ? raw.headings.map((item: unknown) => text(item, 120)).filter(Boolean).slice(0, 6) : [],
  }
}

export async function tryStartMobileManagement(request: NextRequest) {
  const body = await request.clone().json().catch(() => null) as Record<string,any> | null
  if (!body) return null
  const message = text(body.message)
  const attachments = Array.isArray(body.attachment_ids) ? body.attachment_ids.filter(Boolean) : []
  if (!message || attachments.length) return null
  const intent = classifyMobileManagementCenterIntent(message)
  if (!intent) return null

  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ ok:false, error:'로그인이 필요합니다.' }, { status:401, headers:{'Cache-Control':'no-store'} })
  if (session.role !== 'admin') return NextResponse.json({ ok:false, error:'관리자만 이 관리 기능을 사용할 수 있습니다.' }, { status:403, headers:{'Cache-Control':'no-store'} })

  const db = createMoniServiceRoleClient()
  const page = safePage(body.page)
  let threadId = text(body.thread_id, 80)
  let thread: any
  if (threadId) {
    const found = await db.from('moni_ai_threads').select('*').eq('id',threadId).eq('business_id',BUSINESS_ID).eq('user_login_id',session.loginId).eq('status','ACTIVE').maybeSingle()
    if (found.error) throw new Error(found.error.message)
    if (!found.data) return NextResponse.json({ok:false,error:'MONI 대화방을 확인할 수 없습니다.'},{status:404,headers:{'Cache-Control':'no-store'}})
    thread = found.data
  } else {
    const created = await db.from('moni_ai_threads').insert({ business_id:BUSINESS_ID,user_login_id:session.loginId,user_display_name:session.displayName,user_role:session.role,current_page:page }).select('*').single()
    if (created.error) throw new Error(created.error.message)
    thread=created.data; threadId=created.data.id
  }

  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString()
  const running = await db.from('moni_ai_agent_runs').select('id').eq('business_id',BUSINESS_ID).eq('thread_id',threadId).eq('status','RUNNING').gte('started_at',staleBefore).limit(1).maybeSingle()
  if (running.error) throw new Error(running.error.message)
  if (running.data) return NextResponse.json({ok:false,code:'MONI_BUSY',error:'MONI가 이전 질문에 답변 중입니다. 답변이 끝난 뒤 다시 보내 주세요.'},{status:409,headers:{'Cache-Control':'no-store'}})

  const userMessage = await db.from('moni_ai_messages').insert({ business_id:BUSINESS_ID,thread_id:threadId,role:'user',content:message,page_context:page }).select('id').single()
  if (userMessage.error) throw new Error(userMessage.error.message)
  const finalText = mobileManagementCenterText(intent)
  const assistantMessage = await db.from('moni_ai_messages').insert({ business_id:BUSINESS_ID,thread_id:threadId,role:'assistant',content:finalText,page_context:page,provider:'moni-system',model:RUNTIME }).select('id').single()
  if (assistantMessage.error) throw new Error(assistantMessage.error.message)
  const now = new Date().toISOString()
  await db.from('moni_ai_threads').update({ title:thread.title||message.replace(/\s+/g,' ').slice(0,80),current_page:page,updated_at:now,last_message_at:now }).eq('id',threadId).eq('business_id',BUSINESS_ID)
  const run = await db.from('moni_ai_agent_runs').insert({ business_id:BUSINESS_ID,thread_id:threadId,message_id:userMessage.data.id,provider:'moni-system',model:RUNTIME,status:'COMPLETED',validation_status:'VERIFIED',prompt_version:RUNTIME,step_count:1,tool_call_count:0,request_count:0,input_tokens:0,output_tokens:0,total_tokens:0,latency_ms:0,finished_at:now,usage:{requests:0,inputTokens:0,outputTokens:0,totalTokens:0},metadata:{management_center:true,domain:intent.domain} }).select('id').single()

  return NextResponse.json({ ok:true,text:finalText,thread_id:threadId,assistant_message_id:assistantMessage.data.id,source_user_message_id:userMessage.data.id,structured_action_card:true,management_center:true,domain:intent.domain,operation:'READ',provider:'moni-system',model:RUNTIME,agent_runtime:RUNTIME,agent_run_id:run.data?.id||null }, { headers:{'Cache-Control':'no-store'} })
}
