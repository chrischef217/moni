import { randomUUID } from 'crypto'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

const BUSINESS_ID = '20220523011'
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push'
const MAX_SENDS_PER_RUN = 20

type Json = Record<string, any>
type Severity = 'critical' | 'high' | 'attention' | 'data' | 'info'

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function severityRank(value: unknown) {
  const severity = text(value) as Severity
  if (severity === 'critical') return 0
  if (severity === 'high') return 1
  if (severity === 'attention') return 2
  if (severity === 'data') return 3
  return 4
}

function acceptsSeverity(actual: unknown, minimum: unknown) {
  return severityRank(actual) <= severityRank(minimum)
}

function localMinutes(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

function timeMinutes(value: unknown) {
  const match = text(value, 20).match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

function inQuietHours(settings: Json) {
  const start = timeMinutes(settings.quiet_hours_start)
  const end = timeMinutes(settings.quiet_hours_end)
  if (start === null || end === null || start === end) return false
  const zone = text(settings.timezone, 80) || 'Asia/Bangkok'
  let now = 0
  try {
    now = localMinutes(zone)
  } catch {
    now = localMinutes('Asia/Bangkok')
  }
  if (start < end) return now >= start && now < end
  return now >= start || now < end
}

function moniBaseUrl() {
  return text(process.env.MONI_PUBLIC_BASE_URL, 500).replace(/\/$/, '') || 'https://moni-sigma.vercel.app'
}

function won(value: unknown) {
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(num(value)))}원`
}

function lineMessage(event: Json) {
  const severity = text(event.severity).toUpperCase()
  const lines = [
    `[MONI ${severity}] ${text(event.title, 500)}`,
  ]
  if (num(event.impact_amount) > 0) lines.push(`금액 영향: ${won(event.impact_amount)}`)
  if (text(event.due_date)) lines.push(`기준일: ${text(event.due_date, 20)}`)
  if (text(event.summary)) lines.push(`상황: ${text(event.summary, 900)}`)
  if (text(event.recommended_action)) lines.push(`권장 조치: ${text(event.recommended_action, 500)}`)
  lines.push(`MONI 확인: ${moniBaseUrl()}/intelligence`)
  return lines.join('\n').slice(0, 4500)
}

async function recordHistory(client: ReturnType<typeof createMoniServiceRoleClient>, eventId: string, previousStatus: string, nextStatus: string, note: string) {
  const result = await client.from('moni_alert_event_history').insert({
    business_id: BUSINESS_ID,
    event_id: eventId,
    previous_status: previousStatus,
    next_status: nextStatus,
    actor_type: 'notification_gateway',
    note,
  })
  if (result.error) throw new Error(result.error.message)
}

async function markEventSent(client: ReturnType<typeof createMoniServiceRoleClient>, event: Json) {
  if (text(event.status) !== 'new') return
  const updated = await client.from('moni_alert_events')
    .update({ status: 'sent' })
    .eq('id', event.id)
    .eq('business_id', BUSINESS_ID)
    .eq('status', 'new')
    .select('id')
    .maybeSingle()
  if (updated.error) throw new Error(updated.error.message)
  if (updated.data) {
    await recordHistory(client, text(event.id), 'new', 'sent', 'LINE Push 메시지 전송 완료')
  }
}

async function loadOrCreateDelivery(
  client: ReturnType<typeof createMoniServiceRoleClient>,
  event: Json,
  recipient: Json,
) {
  const deliveryKey = `line:${text(event.id)}:reopen:${num(event.reopen_count)}:initial:${text(recipient.id)}`
  const existing = await client.from('moni_alert_deliveries')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .eq('delivery_key', deliveryKey)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return existing.data as Json

  const retryKey = randomUUID()
  const inserted = await client.from('moni_alert_deliveries').insert({
    business_id: BUSINESS_ID,
    event_id: event.id,
    channel: 'line',
    target_ref: recipient.recipient_ref,
    delivery_status: 'queued',
    attempt_no: 1,
    delivery_key: deliveryKey,
    message_type: 'initial',
    retry_key: retryKey,
    retryable: false,
  }).select('*').single()

  if (!inserted.error) return inserted.data as Json
  if (inserted.error.code !== '23505') throw new Error(inserted.error.message)

  const raced = await client.from('moni_alert_deliveries')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .eq('delivery_key', deliveryKey)
    .single()
  if (raced.error) throw new Error(raced.error.message)
  return raced.data as Json
}

function retryAllowed(delivery: Json) {
  if (text(delivery.delivery_status) === 'queued') return true
  if (text(delivery.delivery_status) !== 'failed' || delivery.retryable !== true) return false
  if (num(delivery.attempt_no) >= 3) return false
  const created = new Date(text(delivery.created_at)).getTime()
  if (!Number.isFinite(created)) return false
  return Date.now() - created < 23 * 60 * 60 * 1000
}

async function sendOne(
  client: ReturnType<typeof createMoniServiceRoleClient>,
  token: string,
  event: Json,
  recipient: Json,
) {
  const delivery = await loadOrCreateDelivery(client, event, recipient)
  if (text(delivery.delivery_status) === 'sent') return { status: 'already_sent', event_id: event.id, recipient_id: recipient.id }
  if (!retryAllowed(delivery)) return { status: 'not_retryable', event_id: event.id, recipient_id: recipient.id }

  const retryKey = text(delivery.retry_key, 80) || randomUUID()
  const attemptNo = text(delivery.delivery_status) === 'failed' ? num(delivery.attempt_no) + 1 : Math.max(1, num(delivery.attempt_no))
  const nowIso = new Date().toISOString()

  try {
    const response = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify({
        to: text(recipient.recipient_ref, 200),
        messages: [{ type: 'text', text: lineMessage(event) }],
        notificationDisabled: false,
      }),
      cache: 'no-store',
    })

    const responseText = await response.text().catch(() => '')
    const requestId = response.headers.get('x-line-request-id') || response.headers.get('x-line-accepted-request-id') || null
    const accepted = response.ok || response.status === 409
    const retryable = response.status >= 500

    const updated = await client.from('moni_alert_deliveries').update({
      delivery_status: accepted ? 'sent' : 'failed',
      attempt_no: attemptNo,
      retry_key: retryKey,
      provider_request_id: requestId,
      http_status: response.status,
      retryable: accepted ? false : retryable,
      error_message: accepted ? null : text(responseText, 1200) || `LINE HTTP ${response.status}`,
      sent_at: accepted ? nowIso : null,
      last_attempt_at: nowIso,
    }).eq('id', delivery.id).eq('business_id', BUSINESS_ID)
    if (updated.error) throw new Error(updated.error.message)

    if (accepted) await markEventSent(client, event)
    return {
      status: accepted ? (response.status === 409 ? 'accepted_retry' : 'sent') : 'failed',
      event_id: event.id,
      recipient_id: recipient.id,
      http_status: response.status,
      retryable,
    }
  } catch (error) {
    const updated = await client.from('moni_alert_deliveries').update({
      delivery_status: 'failed',
      attempt_no: attemptNo,
      retry_key: retryKey,
      retryable: true,
      error_message: error instanceof Error ? error.message.slice(0, 1200) : 'LINE network failure',
      last_attempt_at: nowIso,
    }).eq('id', delivery.id).eq('business_id', BUSINESS_ID)
    if (updated.error) throw new Error(updated.error.message)
    return { status: 'failed', event_id: event.id, recipient_id: recipient.id, retryable: true }
  }
}

export async function getLineNotificationState() {
  const client = createMoniServiceRoleClient()
  const [channelResult, recipientsResult, eventsResult] = await Promise.all([
    client.from('moni_notification_channels').select('*').eq('business_id', BUSINESS_ID).eq('channel', 'line').maybeSingle(),
    client.from('moni_notification_recipients').select('*').eq('business_id', BUSINESS_ID).eq('channel', 'line').order('created_at'),
    client.from('moni_alert_events').select('id,severity,status').eq('business_id', BUSINESS_ID).eq('status', 'new'),
  ])
  const failed = [channelResult, recipientsResult, eventsResult].find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)
  const channel = channelResult.data ?? { enabled: false, minimum_severity: 'high', timezone: 'Asia/Bangkok' }
  const recipients = (recipientsResult.data ?? []) as Json[]
  const pending = (eventsResult.data ?? []).filter((event) => acceptsSeverity(event.severity, channel.minimum_severity))
  return {
    channel,
    recipients: recipients.map((recipient) => ({
      id: recipient.id,
      display_name: recipient.display_name,
      active: recipient.active,
      minimum_severity: recipient.minimum_severity,
      verified_at: recipient.verified_at,
      recipient_ref_masked: text(recipient.recipient_ref).length > 8 ? `…${text(recipient.recipient_ref).slice(-8)}` : '등록됨',
    })),
    token_configured: Boolean(text(process.env.LINE_CHANNEL_ACCESS_TOKEN, 400)),
    secret_configured: Boolean(text(process.env.LINE_CHANNEL_SECRET, 400)),
    pending_event_count: pending.length,
  }
}

export async function sendPendingLineAlerts(limit = MAX_SENDS_PER_RUN) {
  const token = text(process.env.LINE_CHANNEL_ACCESS_TOKEN, 400)
  if (!token) return { ok: false, skipped: true, reason: 'LINE_CHANNEL_ACCESS_TOKEN 미설정', sent: 0, failed: 0 }

  const client = createMoniServiceRoleClient()
  const [channelResult, recipientsResult, eventsResult] = await Promise.all([
    client.from('moni_notification_channels').select('*').eq('business_id', BUSINESS_ID).eq('channel', 'line').maybeSingle(),
    client.from('moni_notification_recipients').select('*').eq('business_id', BUSINESS_ID).eq('channel', 'line').eq('active', true),
    client.from('moni_alert_events').select('*').eq('business_id', BUSINESS_ID).eq('status', 'new').order('last_detected_at', { ascending: false }),
  ])
  const failed = [channelResult, recipientsResult, eventsResult].find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)

  const channel = channelResult.data as Json | null
  if (!channel?.enabled) return { ok: true, skipped: true, reason: 'LINE 채널 비활성', sent: 0, failed: 0 }
  const recipients = (recipientsResult.data ?? []) as Json[]
  if (!recipients.length) return { ok: true, skipped: true, reason: '활성 LINE 수신자 없음', sent: 0, failed: 0 }

  const quiet = inQuietHours(channel)
  const events = ((eventsResult.data ?? []) as Json[])
    .filter((event) => acceptsSeverity(event.severity, channel.minimum_severity))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || text(b.last_detected_at).localeCompare(text(a.last_detected_at)))

  const results: Json[] = []
  let sends = 0
  for (const event of events) {
    if (sends >= Math.max(1, Math.min(100, limit))) break
    if (quiet && text(event.severity) !== 'critical') continue
    for (const recipient of recipients) {
      if (sends >= Math.max(1, Math.min(100, limit))) break
      if (!acceptsSeverity(event.severity, recipient.minimum_severity)) continue
      const result = await sendOne(client, token, event, recipient)
      results.push(result)
      if (result.status === 'sent' || result.status === 'accepted_retry' || result.status === 'failed') sends += 1
    }
  }

  return {
    ok: true,
    skipped: false,
    quiet_hours_active: quiet,
    evaluated_events: events.length,
    recipients: recipients.length,
    sent: results.filter((result) => result.status === 'sent' || result.status === 'accepted_retry').length,
    failed: results.filter((result) => result.status === 'failed').length,
    results,
  }
}
