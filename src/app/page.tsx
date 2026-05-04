'use client'

import { useMemo, useState, type ReactNode } from 'react'

type MainMenuKey = 'production' | 'accounting' | 'sales' | 'admin'
type SalesSubMenuKey = 'order' | 'revenue' | 'allowance'

type MainMenu = {
  key: MainMenuKey
  label: string
  description: string
}

type SalesSubMenu = {
  key: SalesSubMenuKey
  label: string
}

const MAIN_MENUS: MainMenu[] = [
  { key: 'production', label: '생산관리', description: '생산 일정, 작업 지시, 공정 모니터링 영역' },
  { key: 'accounting', label: '회계관리', description: '회계 마감, 비용, 세금 관련 영역' },
  { key: 'sales', label: '영업관리', description: '매출, 거래처, 정산 관련 영역' },
  { key: 'admin', label: '관리자', description: '권한, 시스템, 조직 설정 영역' },
]

const SALES_SUB_MENUS: SalesSubMenu[] = [
  { key: 'order', label: '주문관리' },
  { key: 'revenue', label: '매출관리' },
  { key: 'allowance', label: '수당지급 관리' },
]

const TEMP_BUTTONS: Record<Exclude<MainMenuKey, 'sales'>, string[]> = {
  production: ['작업지시 (임시)', '생산실적 (임시)', 'BOM 관리 (임시)', '품질검사 (임시)'],
  accounting: ['전표관리 (임시)', '원가분석 (임시)', '세무자료 (임시)', '정산관리 (임시)'],
  admin: ['사용자관리 (임시)', '권한관리 (임시)', '시스템로그 (임시)', '환경설정 (임시)'],
}

const SALES_TEMP_BUTTONS: Record<Exclude<SalesSubMenuKey, 'allowance'>, string[]> = {
  order: ['주문 등록 (임시)', '주문 조회 (임시)', '납기 관리 (임시)', '출고 요청 (임시)'],
  revenue: ['매출 등록 (임시)', '거래처별 매출 (임시)', '월별 리포트 (임시)', '미수금 관리 (임시)'],
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function MenuButton({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-all duration-200',
        active
          ? 'border-transparent bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-[0_14px_26px_rgba(16,185,129,0.28)]'
          : 'border-slate-200 bg-white/90 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50',
      )}
    >
      {children}
    </button>
  )
}

function TempButtons({ labels }: { labels: string[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {labels.map((label) => (
        <button
          key={label}
          type="button"
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
      {children}
    </span>
  )
}

export default function HomePage() {
  const [mainMenu, setMainMenu] = useState<MainMenuKey>('sales')
  const [salesSubMenu, setSalesSubMenu] = useState<SalesSubMenuKey>('allowance')
  const [showEmbed, setShowEmbed] = useState(true)

  const activeMain = useMemo(() => MAIN_MENUS.find((menu) => menu.key === mainMenu), [mainMenu])
  const allowanceUrl = process.env.NEXT_PUBLIC_ALLOWANCE_PLATFORM_URL ?? 'http://localhost:5173'

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.12),transparent_36%),radial-gradient(circle_at_95%_65%,rgba(14,165,233,0.12),transparent_42%),linear-gradient(180deg,#f8fafc_0%,#ecfeff_100%)] text-slate-900">
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="rounded-[30px] border border-slate-800/80 bg-slate-900 p-5 shadow-[0_24px_46px_rgba(15,23,42,0.35)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">Moni</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">통합 운영 메뉴</h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">생산, 회계, 영업, 관리자 메뉴를 한 화면에서 관리합니다.</p>
            </div>

            <div className="mt-6 rounded-2xl bg-slate-800/60 p-3">
              <p className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">메인 메뉴</p>
              <div className="mt-2 space-y-2">
                {MAIN_MENUS.map((menu) => (
                  <MenuButton
                    key={menu.key}
                    active={mainMenu === menu.key}
                    onClick={() => {
                      setMainMenu(menu.key)
                      if (menu.key !== 'sales') {
                        setSalesSubMenu('order')
                      }
                    }}
                  >
                    {menu.label}
                  </MenuButton>
                ))}
              </div>
            </div>

            {mainMenu === 'sales' ? (
              <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-800/50 p-3">
                <p className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">영업관리 하위 메뉴</p>
                <div className="mt-2 space-y-2">
                  {SALES_SUB_MENUS.map((submenu) => (
                    <MenuButton
                      key={submenu.key}
                      active={salesSubMenu === submenu.key}
                      onClick={() => setSalesSubMenu(submenu.key)}
                    >
                      {submenu.label}
                    </MenuButton>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <main className="space-y-5">
            <section className="rounded-[30px] border border-slate-200 bg-white/95 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.08)] sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">현재 선택</p>
                  <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{activeMain?.label}</h2>
                  <p className="mt-2 text-sm text-slate-600">{activeMain?.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>내부 시스템</Badge>
                  {mainMenu === 'sales' && salesSubMenu === 'allowance' ? <Badge>수당지급 연결 활성</Badge> : null}
                </div>
              </div>
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white/95 p-6 shadow-[0_18px_42px_rgba(15,23,42,0.08)] sm:p-7">
              {mainMenu !== 'sales' ? <TempButtons labels={TEMP_BUTTONS[mainMenu]} /> : null}

              {mainMenu === 'sales' && salesSubMenu !== 'allowance' ? (
                <TempButtons labels={SALES_TEMP_BUTTONS[salesSubMenu]} />
              ) : null}

              {mainMenu === 'sales' && salesSubMenu === 'allowance' ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-cyan-100 bg-gradient-to-r from-emerald-50 to-cyan-50 p-4">
                    <h3 className="text-lg font-semibold text-slate-900">수당지급 관리 플랫폼 연결</h3>
                    <p className="mt-2 text-sm text-slate-700">
                      <code className="rounded bg-white/80 px-1.5 py-0.5 text-[13px] text-slate-800">C:\moni\allowance-platform</code>
                      {' '}앱으로 이동할 수 있도록 연결되어 있습니다.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        href={allowanceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                      >
                        수당지급 관리 열기
                      </a>
                      <button
                        type="button"
                        onClick={() => setShowEmbed((prev) => !prev)}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-cyan-400 hover:bg-cyan-50"
                      >
                        {showEmbed ? '임베드 숨기기' : '임베드 보기'}
                      </button>
                    </div>
                  </div>

                  {showEmbed ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">수당지급 관리 미리보기</p>
                        <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{allowanceUrl}</code>
                      </div>
                      <iframe
                        title="수당지급 관리 플랫폼"
                        src={allowanceUrl}
                        className="h-[760px] w-full bg-white"
                        loading="lazy"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          </main>
        </div>
      </div>
    </div>
  )
}
