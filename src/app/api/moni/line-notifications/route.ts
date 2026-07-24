import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { getLineNotificationState, sendPendingLineAlerts } from '@/lib/moni/lineNotificationGateway'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const SEVERITIES = new Set(['critical', 'high', 'attention', 'data', 'info'])

type Json = Record<string, any>

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

function validTime(value: string) {
  if (!value) return true
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    return NextResponse.json({ ok: true, ...(await getLineNotificationState()) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'LINE 알림 설정을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Json | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 데이터가 없습니다.' }, { status: 400 })
    const action = text(body.action, 80)
    const client = createMoniServiceRoleClient()

    if (action === 'send_pending') {
      const limit = Math.max(1, Math.min(50, Number(body.limit ?? 20) || 20))
      return NextResponse.json(await sendPendingLineAlerts(limit))
    }

    if (action === 'save_channel') {
      const minimumSeverity = SEVERITIES.has(text(body.minimum_severity, 40)) ? text(body.minimum_severity, 40) : 'high'
      const timezone = text(body.timezone, 80) || 'Asia/Bangkok'
      const quietStart = text(body.quiet_hours_start, 10)
      const quietEnd = text(body.quiet_hours_end, 10)
      const enabled = body.enabled === true
      const escalationHours = Math.max(1, Math.min(168, Math.round(Number(body.escalation_repeat_hours ?? 24) || 24)))

      if (!validTimeZone(timezone)) return NextResponse.json({ ok: false, error: '유효한 타임존을 입력해 주세요.' }, { status: 400 })
      if (!validTime(quietStart) || !validTime(quietEnd)) return NextResponse.json({ ok: false, error: '조용한 시간은 HH:MM 형식이어야 합니다.' }, { status: 400 })
      if ((quietStart && !quietEnd) || (!quietStart && quietEnd)) return NextResponse.json({ ok: false, error: '조용한 시간의 시작과 종료를 모두 입력해 주세요.' }, { status: 400 })

      if (enabled) {
        if (!text(process.env.LINE_CHANNEL_ACCESS_TOKEN, 400) || !text(process.env.LINE_CHANNEL_SECRET, 400)) {
          return NextResponse.json({ ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN과 LINE_CHANNEL_SECRET 환경변수를 먼저 설정해야 합니다.' }, { status: 400 })
        }
        const recipients = await client.from('moni_notification_recipients')
          .select('id')
          .eq('business_id', BUSINESS_ID)
          .eq('channel', 'line')
          .eq('active', true)
          .limit(1)
        if (recipients.error) throw new Error(recipients.error.message)
        if (!recipients.data?.length) return NextResponse.json({ ok: false, error: '활성화된 LINE 수신자가 최소 1명 필요합니다.' }, { status: 400 })
      }

      const result = await client.from('moni_notification_channels').upsert({
        business_id: BUSINESS_ID,
        channel: 'line',
        enabled,
        minimum_severity: minimumSeverity,
        quiet_hours_start: quietStart || null,
        quiet_hours_end: quietEnd || null,
        timezone,
        escalation_repeat_hours: escalationHours,
        note: text(body.note, 1000) || null,
      }, { onConflict: 'business_id,channel' }).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, channel: result.data })
    }

    if (action === 'update_recipient') {
      const id = text(body.id, 80)
      if (!id) return NextResponse.json({ ok: false, error: '수신자 ID가 필요합니다.' }, { status: 400 })
      const minimumSeverity = SEVERITIES.has(text(body.minimum_severity, 40)) ? text(body.minimum_severity, 40) : 'high'
      const existing = await client.from('moni_notification_recipients')
        .select('*')
        .eq('id', id)
        .eq('business_id', BUSINESS_ID)
        .eq('channel', 'line')
        .single()
      if (existing.error) throw new Error(existing.error.message)
      const active = body.active === true
      if (active && !existing.data.verified_at) {
        return NextResponse.json({ ok: false, error: 'LINE Webhook으로 검증된 수신자만 활성화할 수 있습니다.' }, { status: 400 })
      }
      const result = await client.from('moni_notification_recipients').update({
        display_name: text(body.display_name, 120) || null,
        active,
        minimum_severity: minimumSeverity,
        note: text(body.note, 1000) || existing.data.note || null,
      }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, recipient: result.data })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 LINE 알림 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'LINE 알림 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
