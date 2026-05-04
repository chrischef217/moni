'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AllowanceStatement from '@/components/AllowanceStatement'
import type { CompanyInfo, Freelancer, PayRecord } from '@/types/allowance'

type PayRecordWithDetails = PayRecord & {
  details: Array<{
    id: number
    product_id: number
    quantity_kg: number
    amount: number
    product_name: string
    price_per_kg: number
    client_name: string
  }>
}

type FreelancerPayload = {
  company: CompanyInfo
  payment_day: number
  freelancer: Freelancer
  payRecords: PayRecordWithDetails[]
}

function toCurrency(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

function paymentDateText(year: number, month: number, paymentDay: number) {
  const d = new Date(year, month, paymentDay)
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일`
}

export default function FreelancerAllowancePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<FreelancerPayload | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/allowance/freelancer/state', { cache: 'no-store' })
        const data = (await response.json().catch(() => null)) as
          | { ok?: boolean; error?: string; data?: FreelancerPayload }
          | null

        if (!response.ok || !data?.ok || !data.data) {
          throw new Error(data?.error || '정산 데이터를 불러오지 못했습니다.')
        }

        if (cancelled) return
        setPayload(data.data)

        if (data.data.payRecords.length > 0) {
          setYear(data.data.payRecords[0].year)
          setMonth(data.data.payRecords[0].month)
          setSelectedRecordId(data.data.payRecords[0].id)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '오류가 발생했습니다.'
        if (!cancelled) setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const recordsForMonth = useMemo(() => {
    if (!payload) return []
    return payload.payRecords.filter((record) => record.year === year && record.month === month)
  }, [payload, year, month])

  const selectedRecord = useMemo(() => {
    if (!recordsForMonth.length) return null
    return recordsForMonth.find((record) => record.id === selectedRecordId) ?? recordsForMonth[0]
  }, [recordsForMonth, selectedRecordId])

  const availablePeriods = useMemo(() => {
    if (!payload) return []
    const periodSet = new Set(payload.payRecords.map((record) => `${record.year}-${record.month}`))
    return Array.from(periodSet)
      .map((key) => {
        const [y, m] = key.split('-').map(Number)
        return { year: y, month: m }
      })
      .sort((a, b) => (b.year - a.year) || (b.month - a.month))
  }, [payload])

  const logout = async () => {
    await fetch('/api/allowance/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617] text-[#94a3b8]">
        수당 정보를 불러오는 중입니다...
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617] p-4 text-[#fca5a5]">
        {error || '데이터를 불러오지 못했습니다.'}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#020617] text-[#e2e8f0]">
      <header className="border-b border-[#1e293b] bg-[#0b1220] px-4 py-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[#10b981]">Moni · 프리랜서 전용</p>
            <h1 className="text-2xl font-bold text-white">수당지급 조회</h1>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-[#7f1d1d] px-3 py-1.5 text-sm font-semibold text-[#fca5a5] hover:bg-[#3f1d1d]"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-6">
        <div className="rounded-2xl border border-[#334155] bg-[#111827] p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-sm text-[#94a3b8]">성명</p>
              <p className="text-lg font-semibold text-white">{payload.freelancer.name}</p>
            </div>
            <div>
              <p className="text-sm text-[#94a3b8]">은행/계좌</p>
              <p className="text-lg font-semibold text-white">{payload.freelancer.bank_name} {payload.freelancer.account_number}</p>
            </div>
            <div>
              <p className="text-sm text-[#94a3b8]">연락처</p>
              <p className="text-lg font-semibold text-white">{payload.freelancer.phone}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
            <label className="text-sm">
              조회 연월
              <select
                className="mt-1 w-full rounded-lg border border-[#334155] bg-[#0f172a] px-3 py-2"
                value={`${year}-${month}`}
                onChange={(event) => {
                  const [nextYear, nextMonth] = event.target.value.split('-').map(Number)
                  setYear(nextYear)
                  setMonth(nextMonth)
                  const first = payload.payRecords.find((record) => record.year === nextYear && record.month === nextMonth)
                  setSelectedRecordId(first?.id ?? null)
                }}
              >
                {availablePeriods.map((period) => (
                  <option key={`${period.year}-${period.month}`} value={`${period.year}-${period.month}`}>
                    {period.year}년 {period.month}월
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-lg border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-[#94a3b8]">
              기준월 + 지급일 설정에 따라 지급일이 자동 계산됩니다.
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[#334155] bg-[#111827] p-4">
          <h2 className="mb-3 text-xl font-semibold text-white">정산 내역</h2>

          {recordsForMonth.length === 0 ? (
            <p className="text-sm text-[#64748b]">선택한 연월의 정산 내역이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {recordsForMonth.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => setSelectedRecordId(record.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    selectedRecord?.id === record.id
                      ? 'border-[#10b981] bg-[#102a2f]'
                      : 'border-[#334155] bg-[#0f172a] hover:border-[#10b981]'
                  }`}
                >
                  <p className="font-semibold text-white">{record.year}년 {record.month}월</p>
                  <p className="text-sm text-[#94a3b8]">총수당 {toCurrency(record.total_amount)} · 차인지급액 {toCurrency(record.net_amount)}</p>
                </button>
              ))}
            </div>
          )}

          {selectedRecord ? (
            <div className="mt-4">
              <div className="no-print mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-lg border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-2 text-sm font-semibold text-white"
                >
                  인쇄
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-lg border border-[#334155] px-3 py-2 text-sm"
                >
                  PDF 저장
                </button>
              </div>

              <AllowanceStatement
                company={payload.company}
                freelancer={payload.freelancer}
                payRecord={selectedRecord}
                details={selectedRecord.details}
                paymentDate={paymentDateText(selectedRecord.year, selectedRecord.month, payload.payment_day)}
              />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
