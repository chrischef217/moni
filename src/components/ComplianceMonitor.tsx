'use client'

import { useState } from 'react'

type SyncResponse = {
  ok?: boolean
  error?: string
  result?: {
    message?: string
    checkedAt?: string
  }
}

export default function ComplianceMonitor() {
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState('')

  const runMfdsSync = async () => {
    setSyncing(true)
    setStatus('')
    try {
      const response = await fetch('/api/mfds/sync', { method: 'POST' })
      const payload = (await response.json().catch(() => null)) as SyncResponse | null
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || payload?.result?.message || '식약처 동기화에 실패했습니다.')
      }
      setStatus(payload.result?.message || '식약처 동기화 완료')
    } catch (error) {
      const message = error instanceof Error ? error.message : '식약처 동기화 중 오류가 발생했습니다.'
      setStatus(message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[#334155] bg-[#111827] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">컴플라이언스 모니터</h3>
          <p className="mt-1 text-sm text-[#94a3b8]">식약처 데이터 동기화 상태를 확인합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => void runMfdsSync()}
          disabled={syncing}
          className="rounded-lg border border-[#10b981] bg-[#10b981] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {syncing ? '동기화 중...' : '🔗 식약처 동기화'}
        </button>
      </div>

      {status ? (
        <div className="mt-3 rounded-lg border border-[#1e293b] bg-[#0f172a] px-3 py-2 text-sm text-[#cbd5e1]">
          {status}
        </div>
      ) : null}
    </div>
  )
}

