import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

function cleanPage(raw: any) {
  return {
    pathname: text(raw?.pathname, 300),
    search: text(raw?.search, 500),
    title: text(raw?.title, 160),
    headings: Array.isArray(raw?.headings)
      ? raw.headings.map((item: unknown) => text(item, 120)).filter(Boolean).slice(0, 6)
      : [],
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })

    const body = await request.json().catch(() => null) as Record<string, any> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const page = cleanPage(body.page)
    const requestedThreadId = text(body.thread_id, 80)
    const supabase = createMoniServiceRoleClient()
    const now = new Date().toISOString()

    if (requestedThreadId) {
      const { data: existing, error } = await supabase.from('moni_ai_threads')
        .select('id,status')
        .eq('id', requestedThreadId)
        .eq('business_id', BUSINESS_ID)
        .eq('user_login_id', session.loginId)
        .eq('status', 'ACTIVE')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!existing) return NextResponse.json({ ok: false, error: 'MONI 대화방을 확인할 수 없습니다.' }, { status: 404 })

      const { error: updateError } = await supabase.from('moni_ai_threads').update({
        current_page: page,
        updated_at: now,
      }).eq('id', existing.id).eq('business_id', BUSINESS_ID)
      if (updateError) throw new Error(updateError.message)

      return NextResponse.json({ ok: true, thread_id: existing.id, created: false }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const { data: created, error } = await supabase.from('moni_ai_threads').insert({
      business_id: BUSINESS_ID,
      user_login_id: session.loginId,
      user_display_name: session.displayName,
      user_role: session.role,
      current_page: page,
      updated_at: now,
    }).select('id').single()
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, thread_id: created.id, created: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'MONI 대화 준비에 실패했습니다.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
