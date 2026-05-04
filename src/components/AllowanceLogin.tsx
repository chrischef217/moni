'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AllowanceLogin() {
  const router = useRouter()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!loginId.trim() || !password.trim()) {
      setError('아이디와 비밀번호를 입력해 주세요.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/allowance/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; user?: { role: 'admin' | 'freelancer' } }
        | null

      if (!response.ok || !payload?.ok || !payload.user) {
        throw new Error(payload?.error || '로그인에 실패했습니다.')
      }

      if (payload.user.role === 'admin') {
        router.replace('/')
      } else {
        router.replace('/freelancer')
      }
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : '로그인 처리 중 오류가 발생했습니다.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020617] p-4 text-[#e2e8f0]">
      <div className="w-full max-w-md rounded-3xl border border-[#334155] bg-[#111827] p-8 shadow-[0_25px_55px_rgba(2,6,23,0.45)]">
        <p className="inline-flex rounded-full border border-[#334155] bg-[#0f172a] px-3 py-1 text-xs font-semibold text-[#93c5fd]">
          통합 로그인
        </p>
        <h1 className="mt-4 text-4xl font-bold text-white">Moni 접속</h1>
        <p className="mt-2 text-sm text-[#94a3b8]">관리자/프리랜서 공통 로그인</p>

        <div className="mt-6 space-y-3">
          <label className="block text-sm text-[#cbd5e1]">
            아이디
            <input
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[#334155] bg-[#0f172a] px-3 py-2 text-white outline-none focus:border-[#10b981]"
            />
          </label>

          <label className="block text-sm text-[#cbd5e1]">
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
              className="mt-1 w-full rounded-xl border border-[#334155] bg-[#0f172a] px-3 py-2 text-white outline-none focus:border-[#10b981]"
            />
          </label>
        </div>

        {error ? <p className="mt-4 text-sm text-[#fca5a5]">{error}</p> : null}

        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-[#1d4ed8] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1e40af] disabled:opacity-50"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </div>
    </div>
  )
}
