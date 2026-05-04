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

function SectionButton({
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
        'w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition',
        active
          ? 'border-accent/20 bg-accent text-white shadow-[0_12px_26px_rgba(37,99,235,0.25)]'
          : 'border-bg-tertiary bg-surface text-text-primary hover:border-accent/30 hover:bg-accent/5',
      )}
    >
      {children}
    </button>
  )
}

function TempButtons({ labels }: { labels: string[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {labels.map((label) => (
        <button
          key={label}
          type="button"
          className="rounded-2xl border border-bg-tertiary bg-surface px-4 py-3 text-sm font-semibold text-text-primary shadow-sm transition hover:border-accent/35 hover:bg-accent/10"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default function HomePage() {
  const [mainMenu, setMainMenu] = useState<MainMenuKey>('sales')
  const [salesSubMenu, setSalesSubMenu] = useState<SalesSubMenuKey>('allowance')
  const [showEmbed, setShowEmbed] = useState(true)

  const activeMain = useMemo(() => MAIN_MENUS.find((menu) => menu.key === mainMenu), [mainMenu])
  const allowanceUrl = process.env.NEXT_PUBLIC_ALLOWANCE_PLATFORM_URL ?? 'http://localhost:5173'

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_38%),linear-gradient(180deg,rgb(239,246,255)_0%,rgb(248,250,252)_100%)] text-text-primary">
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="rounded-[28px] border border-bg-tertiary bg-surface/95 px-6 py-5 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Moni</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">통합 운영 메뉴</h1>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              내부 시스템
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary">요청하신 메뉴 구조를 우선 적용했고, 기능은 임시 버튼으로 배치했습니다.</p>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-bg-tertiary bg-surface/95 p-4 shadow-soft">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">메인 메뉴</p>
            <div className="mt-3 space-y-2">
              {MAIN_MENUS.map((menu) => (
                <SectionButton
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
                </SectionButton>
              ))}
            </div>

            {mainMenu === 'sales' ? (
              <div className="mt-5 rounded-2xl border border-bg-tertiary bg-surface-soft/70 p-3">
                <p className="px-1 text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">영업관리 하위 메뉴</p>
                <div className="mt-2 space-y-2">
                  {SALES_SUB_MENUS.map((submenu) => (
                    <SectionButton
                      key={submenu.key}
                      active={salesSubMenu === submenu.key}
                      onClick={() => setSalesSubMenu(submenu.key)}
                    >
                      {submenu.label}
                    </SectionButton>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <main className="rounded-[28px] border border-bg-tertiary bg-surface/95 p-5 shadow-soft sm:p-6">
            <h2 className="text-2xl font-semibold tracking-tight">{activeMain?.label}</h2>
            <p className="mt-2 text-sm text-text-secondary">{activeMain?.description}</p>

            {mainMenu !== 'sales' ? <div className="mt-5"><TempButtons labels={TEMP_BUTTONS[mainMenu]} /></div> : null}

            {mainMenu === 'sales' && salesSubMenu !== 'allowance' ? (
              <div className="mt-5">
                <TempButtons labels={SALES_TEMP_BUTTONS[salesSubMenu]} />
              </div>
            ) : null}

            {mainMenu === 'sales' && salesSubMenu === 'allowance' ? (
              <section className="mt-5 space-y-4">
                <div className="rounded-2xl border border-bg-tertiary bg-surface-soft/70 p-4">
                  <h3 className="text-lg font-semibold">수당지급 관리 플랫폼 연결</h3>
                  <p className="mt-2 text-sm text-text-secondary">
                    `C:\moni\allowance-platform`에서 실행되는 화면으로 이동할 수 있도록 연결했습니다.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={allowanceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
                    >
                      수당지급 관리 열기
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowEmbed((prev) => !prev)}
                      className="rounded-xl border border-bg-tertiary bg-surface px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent/35 hover:bg-accent/10"
                    >
                      {showEmbed ? '임베드 숨기기' : '임베드 보기'}
                    </button>
                  </div>
                </div>

                {showEmbed ? (
                  <div className="overflow-hidden rounded-2xl border border-bg-tertiary bg-surface">
                    <div className="flex items-center justify-between border-b border-bg-tertiary bg-surface-soft/70 px-4 py-3">
                      <p className="text-sm font-semibold text-text-primary">수당지급 관리 미리보기</p>
                      <code className="rounded bg-black/5 px-2 py-1 text-xs text-text-secondary">{allowanceUrl}</code>
                    </div>
                    <iframe
                      title="수당지급 관리 플랫폼"
                      src={allowanceUrl}
                      className="h-[760px] w-full bg-white"
                      loading="lazy"
                    />
                  </div>
                ) : null}
              </section>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  )
}
