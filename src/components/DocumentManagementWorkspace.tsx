'use client'

import { useEffect, useState } from 'react'

type DocumentView = 'official' | 'quotes' | null

const OFFICIAL_TYPES = [
  { title: '일반 안내', description: '일정, 정책, 운영방식 등 사실을 공식적으로 안내' },
  { title: '요청·협조', description: '자료 제출, 일정 협의, 업무 협조를 정식으로 요청' },
  { title: '통보·변경', description: '가격, 납기, 계약조건, 담당자 등 변경사항을 통보' },
  { title: '회신·확인', description: '상대방 요청에 대한 답변 또는 사실관계를 확인' },
  { title: '사과·정정', description: '오류, 지연, 품질 문제 등에 대한 공식 사과와 정정' },
  { title: '자유 형식', description: '기존 유형에 해당하지 않는 특수 목적의 공문' },
]

function readView(): DocumentView {
  if (window.location.pathname !== '/business-management') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('tab') !== 'document-management') return null
  return params.get('view') === 'quotes' ? 'quotes' : 'official'
}

function OfficialWorkspace() {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-6 py-8 lg:px-10 lg:py-10">
      <div className="rounded-[28px] border border-sky-100 bg-white/90 p-7 shadow-[0_18px_45px_rgba(44,91,126,0.10)] backdrop-blur-sm lg:p-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black tracking-[0.18em] text-sky-700">DOCUMENT MANAGEMENT</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#173b52]">대외 공문 관리</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#627f91]">
              회사가 거래처·공급업체·기관 등에 발송하는 공식 문서를 작성하고, 문서번호와 발송 이력을 관리하는 업무 화면입니다.
            </p>
          </div>
          <button
            type="button"
            disabled
            title="공문 작성 기준 확정 후 활성화됩니다."
            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-800 opacity-70"
          >
            + 새 공문 작성 · 설계 중
          </button>
        </div>
      </div>

      <section className="mt-6 rounded-[28px] border border-sky-100 bg-white/90 shadow-[0_18px_45px_rgba(44,91,126,0.08)] backdrop-blur-sm">
        <div className="border-b border-sky-100 px-7 py-6 lg:px-9">
          <div className="text-xs font-black tracking-[0.16em] text-sky-700">DOCUMENT TYPES</div>
          <h2 className="mt-2 text-2xl font-black text-[#173b52]">공문 목적 선택</h2>
          <p className="mt-2 text-sm text-[#6a8495]">형식을 먼저 고르면 필요한 입력항목과 기본 문구만 자동으로 제안하는 방식으로 설계합니다.</p>
        </div>
        <div className="grid gap-4 p-7 md:grid-cols-2 xl:grid-cols-3 lg:p-9">
          {OFFICIAL_TYPES.map((type, index) => (
            <article key={type.title} className="rounded-2xl border border-[#d9e9f4] bg-[#f8fbfd] p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sm font-black text-sky-800">{index + 1}</span>
                <h3 className="text-base font-black text-[#173b52]">{type.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#6a8495]">{type.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="rounded-[24px] border border-sky-100 bg-white/90 p-6 lg:col-span-2">
          <div className="text-xs font-black tracking-[0.16em] text-sky-700">REQUIRED FIELDS</div>
          <h2 className="mt-2 text-xl font-black text-[#173b52]">모든 공문에 공통으로 들어갈 항목</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {['문서번호·발송일', '수신 회사·담당자', '공문 제목', '공문 목적·관련 근거', '본문', '첨부파일 목록', '발신 회사정보', '작성자·승인자·직인'].map((item) => (
              <div key={item} className="rounded-xl border border-[#dfebf3] bg-[#f8fbfd] px-4 py-3 text-sm font-bold text-[#36586d]">{item}</div>
            ))}
          </div>
        </div>
        <div className="rounded-[24px] border border-amber-200 bg-amber-50/85 p-6">
          <div className="text-xs font-black tracking-[0.16em] text-amber-700">CONTROL RULE</div>
          <h2 className="mt-2 text-xl font-black text-[#654800]">운영 원칙</h2>
          <p className="mt-4 text-sm leading-7 text-[#806321]">
            발송 완료된 공문은 삭제하지 않고 취소·정정 이력을 남깁니다. 문서번호와 최종 PDF는 발송 시점에 고정합니다.
          </p>
        </div>
      </section>
    </div>
  )
}

function QuoteWorkspace() {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-6 py-8 lg:px-10 lg:py-10">
      <div className="rounded-[28px] border border-sky-100 bg-white/90 p-8 shadow-[0_18px_45px_rgba(44,91,126,0.10)] backdrop-blur-sm lg:p-10">
        <div className="text-xs font-black tracking-[0.18em] text-sky-700">DOCUMENT MANAGEMENT</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#173b52]">견적서 관리</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#627f91]">
          견적서 작성, 버전관리, 유효기간, 거래처 발송 이력을 관리할 화면입니다. 대외 공문 관리 기준을 확정한 뒤 다음 순서로 개발합니다.
        </p>
        <div className="mt-8 rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 px-6 py-10 text-center">
          <div className="text-lg font-black text-[#36586d]">견적서 관리 기본 메뉴 생성 완료</div>
          <div className="mt-2 text-sm text-[#6a8495]">세부 기능은 대외 공문 관리 완성 후 연결합니다.</div>
        </div>
      </div>
    </div>
  )
}

export default function DocumentManagementWorkspace() {
  const [view, setView] = useState<DocumentView>(null)

  useEffect(() => {
    const sync = () => setView(readView())
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  if (!view) return null

  return (
    <div
      data-document-management-workspace
      className="absolute inset-0 z-[800] overflow-auto bg-[radial-gradient(circle_at_86%_0%,rgba(134,207,255,0.16),transparent_28%),linear-gradient(145deg,rgba(246,251,255,0.98),rgba(231,242,252,0.98))]"
    >
      {view === 'quotes' ? <QuoteWorkspace /> : <OfficialWorkspace />}
    </div>
  )
}
