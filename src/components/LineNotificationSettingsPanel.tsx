'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Severity = 'critical' | 'high' | 'attention' | 'data' | 'info'
type Channel = {
  enabled: boolean
  minimum_severity: Severity
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  timezone: string
  escalation_repeat_hours: number
  note?: string | null
}
type Recipient = {
  id: string
  display_name?: string | null
  active: boolean
  minimum_severity: Severity
  verified_at?: string | null
  recipient_ref_masked: string
}
type Payload = {
  ok: boolean
  error?: string
  channel: Channel
  recipients: Recipient[]
  token_configured: boolean
  secret_configured: boolean
  pending_event_count: number
}

const SEVERITY_OPTIONS: Array<{ value: Severity; label: string }> = [
  { value: 'critical', label: 'Critical만' },
  { value: 'high', label: 'High 이상' },
  { value: 'attention', label: 'Attention 이상' },
  { value: 'data', label: 'Data 이상' },
  { value: 'info', label: '전체' },
]

function trimTime(value?: string | null) {
  return String(value || '').slice(0, 5)
}

export default function LineNotificationSettingsPanel() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    enabled: false,
    minimum_severity: 'high' as Severity,
    quiet_hours_start: '',
    quiet_hours_end: '',
    timezone: 'Asia/Bangkok',
    escalation_repeat_hours: 24,
  })
  const [recipientDrafts, setRecipientDrafts] = useState<Record<string, { display_name: string; active: boolean; minimum_severity: Severity }>>({})
  const [origin, setOrigin] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/moni/line-notifications?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'LINE 알림 설정을 불러오지 못했습니다.')
      setData(payload)
      setForm({
        enabled: payload.channel?.enabled === true,
        minimum_severity: payload.channel?.minimum_severity || 'high',
        quiet_hours_start: trimTime(payload.channel?.quiet_hours_start),
        quiet_hours_end: trimTime(payload.channel?.quiet_hours_end),
        timezone: payload.channel?.timezone || 'Asia/Bangkok',
        escalation_repeat_hours: Number(payload.channel?.escalation_repeat_hours || 24),
      })
      const drafts: Record<string, { display_name: string; active: boolean; minimum_severity: Severity }> = {}
      for (const recipient of payload.recipients ?? []) {
        drafts[recipient.id] = {
          display_name: recipient.display_name || '',
          active: recipient.active === true,
          minimum_severity: recipient.minimum_severity || 'high',
        }
      }
      setRecipientDrafts(drafts)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'LINE 알림 설정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setOrigin(window.location.origin)
    void load()
  }, [load])

  const activeRecipients = useMemo(() => Object.values(recipientDrafts).filter((row) => row.active).length, [recipientDrafts])
  const ready = Boolean(data?.token_configured && data?.secret_configured && activeRecipients > 0)

  async function saveChannel() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/moni/line-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_channel', ...form }),
      })
      const payload = await response.json() as { ok: boolean; error?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'LINE 채널 설정을 저장하지 못했습니다.')
      setNotice('LINE 채널 설정을 저장했습니다.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'LINE 채널 설정을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function saveRecipient(recipient: Recipient) {
    const draft = recipientDrafts[recipient.id]
    if (!draft) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/moni/line-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_recipient', id: recipient.id, ...draft }),
      })
      const payload = await response.json() as { ok: boolean; error?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error || '수신자 설정을 저장하지 못했습니다.')
      setNotice('LINE 수신자 설정을 저장했습니다.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '수신자 설정을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function sendPending() {
    if (!window.confirm('현재 NEW 상태의 LINE 대상 경고를 실제 전송합니다. 계속할까요?')) return
    setSending(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/moni/line-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_pending', limit: 20 }),
      })
      const payload = await response.json() as { ok: boolean; error?: string; sent?: number; failed?: number; reason?: string; skipped?: boolean }
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'LINE 알림을 전송하지 못했습니다.')
      setNotice(payload.skipped ? `전송하지 않음: ${payload.reason || '조건 미충족'}` : `전송 ${payload.sent ?? 0}건 · 실패 ${payload.failed ?? 0}건`)
      await load()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'LINE 알림을 전송하지 못했습니다.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="bg-[#071426] px-4 pb-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1500px] rounded-3xl border border-emerald-400/15 bg-[#0b1b30] p-5 shadow-xl lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">EXTERNAL NOTIFICATION GATEWAY · V14</p>
            <h2 className="mt-1 text-2xl font-black">LINE 알림 설정</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">MONI Alert/Event 원장의 Critical·High 경고를 LINE Official Account로 전달합니다. 채널 토큰과 시크릿은 화면이나 DB에 저장하지 않습니다.</p>
          </div>
          <div className={`rounded-xl border px-3 py-2 text-xs font-black ${form.enabled ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-slate-600 bg-slate-800/50 text-slate-400'}`}>{form.enabled ? 'LINE 활성' : 'LINE 비활성'}</div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-xs text-slate-500">Channel Access Token</div><div className={`mt-1 font-black ${data?.token_configured ? 'text-emerald-200' : 'text-red-200'}`}>{data?.token_configured ? '설정됨' : '미설정'}</div></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-xs text-slate-500">Channel Secret</div><div className={`mt-1 font-black ${data?.secret_configured ? 'text-emerald-200' : 'text-red-200'}`}>{data?.secret_configured ? '설정됨' : '미설정'}</div></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-xs text-slate-500">활성 수신자</div><div className="mt-1 text-xl font-black">{activeRecipients}명</div></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-xs text-slate-500">현재 NEW 대상 Alert</div><div className="mt-1 text-xl font-black">{data?.pending_event_count ?? 0}건</div></div>
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-400/25 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200">{error}</div>}
        {notice && <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-3 text-sm text-emerald-200">{notice}</div>}

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <h3 className="font-black">1. LINE Developers 연결</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Vercel 환경변수에 `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`을 설정한 뒤 아래 URL을 Messaging API Webhook으로 등록합니다.</p>
            <div className="mt-3 break-all rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-cyan-200">{origin ? `${origin}/api/moni/line-webhook` : '/api/moni/line-webhook'}</div>
            <p className="mt-3 text-xs leading-5 text-slate-600">Official Account를 친구 추가하거나 메시지를 보내면 LINE 서명이 검증된 `userId`만 수신자 목록에 자동 발견됩니다. 발견된 수신자는 기본 비활성이라 관리자 승인 전에는 경영 알림을 받지 않습니다.</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <h3 className="font-black">2. 채널 정책</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-500">최소 심각도<select value={form.minimum_severity} onChange={(event) => setForm((current) => ({ ...current, minimum_severity: event.target.value as Severity }))} className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">{SEVERITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="text-xs text-slate-500">타임존<input value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" /></label>
              <label className="text-xs text-slate-500">조용한 시간 시작<input type="time" value={form.quiet_hours_start} onChange={(event) => setForm((current) => ({ ...current, quiet_hours_start: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" /></label>
              <label className="text-xs text-slate-500">조용한 시간 종료<input type="time" value={form.quiet_hours_end} onChange={(event) => setForm((current) => ({ ...current, quiet_hours_end: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" /></label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />LINE 자동 발송 활성화</label><button type="button" disabled={saving || loading} onClick={() => void saveChannel()} className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] px-4 py-2.5 text-sm font-black text-emerald-100 disabled:opacity-40">{saving ? '저장 중...' : '정책 저장'}</button></div>
            {form.enabled && !ready && <p className="mt-3 text-xs text-amber-300">활성화하려면 토큰·시크릿과 Webhook 검증된 활성 수신자가 모두 필요합니다.</p>}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">3. Webhook 검증 수신자</h3><p className="mt-1 text-xs text-slate-600">수신자 원본 userId는 화면에 노출하지 않고 끝 8자리만 표시합니다.</p></div><button type="button" onClick={() => void load()} className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-bold text-slate-300">새로고침</button></div>
          <div className="mt-4 space-y-3">
            {(data?.recipients ?? []).map((recipient) => {
              const draft = recipientDrafts[recipient.id] || { display_name: '', active: false, minimum_severity: 'high' as Severity }
              return <div key={recipient.id} className="grid gap-3 rounded-xl border border-white/10 p-3 lg:grid-cols-[1fr_180px_160px_auto] lg:items-end"><label className="text-xs text-slate-500">표시 이름<input value={draft.display_name} onChange={(event) => setRecipientDrafts((current) => ({ ...current, [recipient.id]: { ...draft, display_name: event.target.value } }))} placeholder="예: Managing Director" className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /><span className="mt-1 block text-[10px] text-slate-700">LINE ID {recipient.recipient_ref_masked} · {recipient.verified_at ? 'Webhook 검증됨' : '미검증'}</span></label><label className="text-xs text-slate-500">최소 심각도<select value={draft.minimum_severity} onChange={(event) => setRecipientDrafts((current) => ({ ...current, [recipient.id]: { ...draft, minimum_severity: event.target.value as Severity } }))} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{SEVERITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="flex h-[42px] items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm font-bold"><input type="checkbox" checked={draft.active} onChange={(event) => setRecipientDrafts((current) => ({ ...current, [recipient.id]: { ...draft, active: event.target.checked } }))} />알림 수신</label><button type="button" disabled={saving} onClick={() => void saveRecipient(recipient)} className="h-[42px] rounded-lg border border-blue-400/25 px-4 text-xs font-black text-blue-100 disabled:opacity-40">수신자 저장</button></div>
            })}
            {!loading && !(data?.recipients?.length) && <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">아직 Webhook으로 검증된 LINE 수신자가 없습니다.</div>}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-400/15 bg-orange-400/[0.035] p-4"><div><b className="text-orange-100">실제 발송</b><p className="mt-1 text-xs text-slate-500">`NEW` Alert 중 채널/수신자 심각도 기준을 통과한 항목만 발송하며, delivery key와 LINE Retry Key로 중복을 방지합니다.</p></div><button type="button" disabled={sending || !form.enabled} onClick={() => void sendPending()} className="rounded-xl bg-orange-300 px-4 py-2.5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-30">{sending ? '전송 중...' : `대기 경고 전송 (${data?.pending_event_count ?? 0})`}</button></div>
      </div>
    </section>
  )
}
