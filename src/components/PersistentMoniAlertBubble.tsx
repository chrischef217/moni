'use client'

import { useEffect, useRef, useState } from 'react'

type AlertEvent = {
  id: string
  severity: 'critical' | 'high' | 'attention' | 'data' | 'info'
  status: 'new' | 'sent' | 'acknowledged' | 'in_progress' | 'resolved' | 'ignored' | 'deferred'
  title: string
  read_at?: string | null
  last_detected_at: string
}

type AlertPayload = {
  ok: boolean
  events: AlertEvent[]
}

const SHOWN_AT_KEY = 'moni-persistent-bubble-shown-at-v12'
const LAST_EVENT_KEY = 'moni-persistent-bubble-event-v12'
const DEFAULT_TEXT = 'MONI에게 무엇이든 물어보세요.'
const THROTTLE_MS = 30 * 60 * 1000

function storedNumber(key: string) {
  try {
    return Number(window.sessionStorage.getItem(key) || 0)
  } catch {
    return 0
  }
}

function storedText(key: string) {
  try {
    return window.sessionStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function remember(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // sessionStorage is best-effort only.
  }
}

function openMoniAgent() {
  const button = document.querySelector<HTMLButtonElement>('[data-global-moni-agent] > button[aria-label="MONI Agent 열기"]')
  button?.click()
}

export default function PersistentMoniAlertBubble() {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState(DEFAULT_TEXT)
  const [eventId, setEventId] = useState('')
  const hideTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    const hideLater = () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => setVisible(false), 12000)
    }

    const load = async (fromSync = false) => {
      try {
        const response = await fetch(`/api/moni/alerts?limit=30&_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json() as AlertPayload
        if (!response.ok || !payload.ok || cancelled) return

        const urgent = (payload.events ?? [])
          .filter((event) => event.status === 'new' && (event.severity === 'critical' || event.severity === 'high'))
          .sort((a, b) => {
            const severity = (value: AlertEvent['severity']) => value === 'critical' ? 0 : 1
            return severity(a.severity) - severity(b.severity) || String(b.last_detected_at).localeCompare(String(a.last_detected_at))
          })[0]

        const now = Date.now()
        const lastShownAt = storedNumber(SHOWN_AT_KEY)
        const lastEventId = storedText(LAST_EVENT_KEY)
        const isNewUrgent = Boolean(urgent?.id && urgent.id !== lastEventId)
        const throttled = now - lastShownAt < THROTTLE_MS

        if (urgent) {
          if (throttled && !isNewUrgent && !fromSync) return
          if (throttled && !isNewUrgent && fromSync) return
          setMessage(urgent.title || DEFAULT_TEXT)
          setEventId(urgent.id)
          setVisible(true)
          remember(SHOWN_AT_KEY, String(now))
          remember(LAST_EVENT_KEY, urgent.id)
          hideLater()
          return
        }

        if (throttled || fromSync) return
        setMessage(DEFAULT_TEXT)
        setEventId('')
        setVisible(true)
        remember(SHOWN_AT_KEY, String(now))
        hideLater()
      } catch {
        // A proactive bubble must not block normal MONI operation.
      }
    }

    const initial = window.setTimeout(() => void load(false), 2600)
    const onSynced = () => void load(true)
    window.addEventListener('moni-alerts-synced', onSynced)
    return () => {
      cancelled = true
      window.clearTimeout(initial)
      window.removeEventListener('moni-alerts-synced', onSynced)
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [])

  async function handleClick() {
    setVisible(false)
    if (eventId) {
      fetch('/api/moni/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_view', id: eventId }),
      }).catch(() => null)
    }
    openMoniAgent()
  }

  return (
    <>
      {visible && (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="fixed bottom-[96px] right-4 z-[136] w-[min(320px,calc(100vw-32px))] rounded-2xl border border-white/20 bg-[#0c1d33]/95 px-4 py-3 text-left text-sm font-bold leading-5 text-white shadow-[0_18px_55px_rgba(2,6,23,0.42)] backdrop-blur-xl md:bottom-[110px] md:right-6"
        >
          <span className="mb-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-300">
            MONI
            {eventId && <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-[9px] tracking-normal text-red-200">NEW ALERT</span>}
          </span>
          {message}
          <span className="absolute -bottom-2 right-7 h-4 w-4 rotate-45 border-b border-r border-white/20 bg-[#0c1d33]" />
        </button>
      )}
      <style jsx global>{`
        /* V12 owns the proactive bubble. Keep V9 chat/character intact while suppressing its raw-Intelligence bubble. */
        [data-global-moni-agent] > button.absolute { display: none !important; }
      `}</style>
    </>
  )
}
