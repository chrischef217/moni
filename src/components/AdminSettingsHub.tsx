'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import CompanySettingsModule from '@/components/CompanySettingsModule'
import AppearanceSettingsModule from '@/components/AppearanceSettingsModule'

type Section = 'company' | 'appearance' | 'system'

const sections: Array<{ key: Section; label: string; description: string }> = [
  { key: 'company', label: '회사 기본정보', description: '회사정보·대표자·서명' },
  { key: 'appearance', label: '화면·배경 설정', description: 'MONI 화면 및 날씨 배경' },
  { key: 'system', label: '관리자 설정', description: '사용자 및 기존 관리자 기능' },
]

export default function AdminSettingsHub() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const rawSection = searchParams.get('section')
  const section: Section = rawSection === 'appearance' || rawSection === 'system' ? rawSection : 'company'

  function move(next: Section) {
    router.push(`/settings/appearance?section=${next}`)
  }

  function openLegacy(target: string, label = target, parentTarget = '관리자') {
    window.sessionStorage.setItem('moni-pending-nav', JSON.stringify({
      category: 'admin',
      target,
      label,
      parentTarget,
    }))
    router.push('/?legacy=1')
  }

  return (
    <main data-admin-settings-hub className="min-h-screen bg-transparent px-4 py-5 text-[#17384d] md:px-6">
      <div className="mx-auto max-w-[1480px]">
        <header className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-5 shadow-[0_14px_36px_rgba(43,84,109,0.08)] md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.17em] text-[#2b9b76]">ADMINISTRATION</p>
              <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">관리자</h1>
              <p className="mt-1.5 text-sm text-[#6b8392]">관리 항목을 상단에서 선택합니다.</p>
            </div>
          </div>

          <nav className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="관리자 카테고리">
            {sections.map((item) => {
              const active = section === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => move(item.key)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? 'border-[#66c8a5] bg-[#ecfaf4] shadow-[0_4px_14px_rgba(32,151,111,0.10)]'
                      : 'border-[#d4e3eb] bg-[#f8fbfd] hover:border-[#a9cbdc] hover:bg-white'
                  }`}
                >
                  <span className={`block text-sm font-black ${active ? 'text-[#176f53]' : 'text-[#315469]'}`}>{item.label}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-[#8195a2]">{item.description}</span>
                </button>
              )
            })}
          </nav>
        </header>

        <div className="mt-4">
          {section === 'company' && <CompanySettingsModule />}
          {section === 'appearance' && <AppearanceSettingsModule />}
          {section === 'system' && (
            <section className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-6 shadow-[0_12px_34px_rgba(43,84,109,0.07)] lg:p-7">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#5d91ad]">ADMIN SYSTEM</p>
                <h2 className="mt-1 text-2xl font-black">관리자 설정</h2>
                <p className="mt-2 text-sm leading-6 text-[#718896]">기존 MONI 관리자 기능으로 이동합니다. 회사 기본정보와 화면 설정은 위 상단 카테고리에서 관리합니다.</p>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <button type="button" onClick={() => openLegacy('관리자', '관리자 설정')} className="rounded-2xl border border-[#d5e4ec] bg-[#f8fbfd] p-5 text-left transition hover:border-[#9cc7da] hover:bg-white">
                  <span className="text-xl">⚙</span>
                  <b className="mt-3 block text-base text-[#294f65]">관리자 설정</b>
                  <span className="mt-1 block text-xs leading-5 text-[#8195a2]">기존 관리자 설정 화면을 엽니다.</span>
                </button>
                <button type="button" onClick={() => openLegacy('사용자 관리', '사용자 관리')} className="rounded-2xl border border-[#d5e4ec] bg-[#f8fbfd] p-5 text-left transition hover:border-[#9cc7da] hover:bg-white">
                  <span className="text-xl">♙</span>
                  <b className="mt-3 block text-base text-[#294f65]">사용자 관리</b>
                  <span className="mt-1 block text-xs leading-5 text-[#8195a2]">MONI 사용자와 권한 관련 기능으로 이동합니다.</span>
                </button>
                <button type="button" onClick={() => openLegacy('레시피 원재료 연결', '레시피 원재료 연결', '생산관리')} className="rounded-2xl border border-[#d5e4ec] bg-[#f8fbfd] p-5 text-left transition hover:border-[#9cc7da] hover:bg-white">
                  <span className="text-xl">▦</span>
                  <b className="mt-3 block text-base text-[#294f65]">레시피 원재료 연결</b>
                  <span className="mt-1 block text-xs leading-5 text-[#8195a2]">기존 생산 레시피 연결 관리 기능으로 이동합니다.</span>
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
