'use client'

import Link from 'next/link'

export default function AllowancePage() {
  return (
    <div className="min-h-screen bg-[#0b1220] px-4 py-8 text-[#e2e8f0] lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-[#1e293b] bg-[#0f172a] p-6 shadow-[0_20px_40px_rgba(2,6,23,0.35)] lg:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#64748b]">Moni / 영업관리</p>
              <h1 className="mt-2 text-3xl font-bold text-white">수당지급 관리</h1>
              <p className="mt-2 text-sm text-[#94a3b8]">
                Moni 내부 경로에서 제공되는 화면입니다. 외부 `localhost` 임베드 연결은 제거했습니다.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-lg border border-[#334155] px-4 py-2 text-sm font-semibold text-[#cbd5e1] hover:bg-[#1e293b]"
            >
              채팅 홈으로 돌아가기
            </Link>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <button type="button" className="rounded-2xl border border-[#334155] bg-[#111827] px-4 py-3 text-left text-sm font-semibold text-white hover:border-[#10b981]">프리랜서 관리</button>
            <button type="button" className="rounded-2xl border border-[#334155] bg-[#111827] px-4 py-3 text-left text-sm font-semibold text-white hover:border-[#10b981]">거래처/제품 관리</button>
            <button type="button" className="rounded-2xl border border-[#334155] bg-[#111827] px-4 py-3 text-left text-sm font-semibold text-white hover:border-[#10b981]">수당 관리</button>
            <button type="button" className="rounded-2xl border border-[#334155] bg-[#111827] px-4 py-3 text-left text-sm font-semibold text-white hover:border-[#10b981]">관리자 설정</button>
          </div>

          <div className="mt-6 rounded-2xl border border-[#334155] bg-[#111827] p-5">
            <p className="text-sm text-[#94a3b8]">
              현재는 Moni 내부 이동 구조를 우선 정리한 상태입니다. 다음 단계에서 기존 `C:\moni\allowance-platform` 기능을 이 경로로 순차 통합합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
