import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'

type Json = Record<string, any>

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)

function verifySignature(rawBody: string, signature: string, secret: string) {
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64')
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}

export async function POST(request: NextRequest) {
  const secret = text(process.env.LINE_CHANNEL_SECRET, 500)
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'LINE_CHANNEL_SECRET is not configured.' }, { status: 503 })
  }

  const rawBody = await request.text()
  const signature = text(request.headers.get('x-line-signature'), 500)
  if (!signature || !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ ok: false, error: 'Invalid LINE signature.' }, { status: 401 })
  }

  let payload: Json
  try {
    payload = JSON.parse(rawBody) as Json
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid LINE webhook JSON.' }, { status: 400 })
  }

  const events = Array.isArray(payload.events) ? payload.events : []
  const userIds = Array.from(new Set(events
    .map((event: Json) => event?.source?.type === 'user' ? text(event?.source?.userId, 200) : '')
    .filter(Boolean)))

  if (!userIds.length) return NextResponse.json({ ok: true, discovered: 0 })

  const client = createMoniServiceRoleClient()
  let discovered = 0
  let refreshed = 0
  const nowIso = new Date().toISOString()

  for (const userId of userIds) {
    const existing = await client.from('moni_notification_recipients')
      .select('id,active')
      .eq('business_id', BUSINESS_ID)
      .eq('channel', 'line')
      .eq('recipient_ref', userId)
      .maybeSingle()
    if (existing.error) throw new Error(existing.error.message)

    if (existing.data) {
      const updated = await client.from('moni_notification_recipients')
        .update({ verified_at: nowIso })
        .eq('id', existing.data.id)
        .eq('business_id', BUSINESS_ID)
      if (updated.error) throw new Error(updated.error.message)
      refreshed += 1
      continue
    }

    const inserted = await client.from('moni_notification_recipients').insert({
      business_id: BUSINESS_ID,
      channel: 'line',
      recipient_ref: userId,
      display_name: null,
      active: false,
      minimum_severity: 'high',
      verified_at: nowIso,
      note: 'LINE Webhook에서 검증된 수신자. 관리자가 활성화해야 알림 발송.',
    })
    if (inserted.error && inserted.error.code !== '23505') throw new Error(inserted.error.message)
    if (!inserted.error) discovered += 1
  }

  return NextResponse.json({ ok: true, discovered, refreshed })
}
