'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type CategoryKey = 'ai' | 'production' | 'hr' | 'sales' | 'accounting' | 'admin' | 'audit'
type MenuItem = { label: string; target?: string; href?: string; parentTarget?: string }
type Category = { key: CategoryKey; label: string; icon: string; items: MenuItem[] }

const PIN_STORAGE_KEY = 'moni-sidebar-pinned'
const PEEK_CLOSE_DELAY_MS = 140

const categories: Category[] = [
  {
    key: 'ai', label: 'AI 챗팅', icon: '✦', items: [
      { label: 'AI 채팅', target: 'AI 채팅' },
      { label: '새 대화', target: '새 대화' },
    ],
  },
  {
    key: 'production', label: '생산관리', icon: '▦', items: [
      { label: '생산 대시보드', target: '생산 개요' },
      { label: '월간 생산계획', href: '/monthly-production-plan' },
      { label: '작업지시서', target: '작업 지시' },
      { label: '생산일보', href: '/production-daily' },
      { label: '원료 수불부', target: '원료수불부' },
      { label: '제품 관리', target: '제품관리' },
      { label: '원재료 관리', target: '원재료 관리' },
      { label: '부재료 관리', target: '부재료 관리' },
      { label: '위생점검', target: '위생점검' },
      { label: '품질관리', target: '품질 관리' },
      { label: '규정준수', target: '규정준수 모니터' },
    ],
  },
  {
    key: 'hr', label: '인사관리', icon: '♙', items: [
      { label: '정규직 직원관리', href: '/business-management?tab=hr&view=employees' },
      { label: '프리랜서 인력관리', href: '/business-management?tab=hr&view=people' },
      { label: '계약·정산조건', href: '/business-management?tab=hr&view=contracts' },
      { label: '필수서류 관리', href: '/business-management?tab=hr&view=documents' },
    ],
  },
  {
    key: 'sales', label: '영업관리', icon: '↗', items: [
      { label: '고객사 및 담당자', href: '/business-management?tab=sales&view=clients' },
      { label: '영업기회 파이프라인', href: '/business-management?tab=sales&view=pipeline' },
      { label: '영업활동·상담기록', href: '/business-management?tab=sales&view=activities' },
    ],
  },
  {
    key: 'accounting', label: '회계·세무관리', icon: '₩', items: [
      { label: '월별 프리랜서 정산', href: '/business-management?tab=accounting&view=settlements' },
      { label: '생산 근무보정', href: '/business-management?tab=accounting&view=work-logs' },
      { label: '정산서 출력', href: '/business-management?tab=accounting&view=print' },
    ],
  },
  {
    key: 'admin', label: '관리자', icon: '⚙', items: [
      { label: '관리자 설정', target: '관리자' },
      { label: '회사정보', target: '회사정보' },
      { label: '사용자 관리', target: '사용자 관리' },
      { label: '레시피 원재료 연결', target: '레시피 원재료 연결', parentTarget: '생산관리' },
    ],
  },
  {
    key: 'audit', label: '재무감사', icon: '✓', items: [
      { label: '재무감사', target: '재무감사' },
      { label: '감사 기록', href: '/audit' },
    ],
  },
]

function normalizedText(element: Element) {
  return (element.textContent || '').replace(/\s+/g, ' ').trim()
}

function findDashboardButton(label: string) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button:not([data-moni-global-nav])'))
  return buttons.find((button) => normalizedText(button) === label)
    || buttons.find((button) => normalizedText(button).includes(label))
    || null
}

function clickDashboardTarget(label: string) {
  const button = findDashboardButton(label)
  if (!button) return false
  button.click()
  return true
}

function businessRouteState(search: string): { category: CategoryKey; item: string } {
  const params = new URLSearchParams(search)
  const tab = params.get('tab') || 'hr'
  const view = params.get('view') || ''

  if (tab === 'sales') {
    if (view === 'pipeline') return { category: 'sales', item: '영업기회 파이프라인' }
    if (view === 'activities') return { category: 'sales', item: '영업활동·상담기록' }
    return { category: 'sales', item: '고객사 및 담당자' }
  }

  if (tab === 'accounting') {
    if (view === 'work-logs') return { category: 'accounting', item: '생산 근무보정' }
    if (view === 'print') return { category: 'accounting', item: '정산서 출력' }
    return { category: 'accounting', item: '월별 프리랜서 정산' }
  }

  if (view === 'employees') return { category: 'hr', item: '정규직 직원관리' }
  if (view === 'contracts') return { category: 'hr', item: '계약·정산조건' }
  if (view === 'documents') return { category: 'hr', item: '필수서류 관리' }
  return { category: 'hr', item: '프리랜서 인력관리' }
}

function routeState(pathname: string, search = ''): { category: CategoryKey; item: string } {
  if (pathname === '/monthly-production-plan') return { category: 'production', item: '월간 생산계획' }
  if (pathname === '/production-daily') return { category: 'production', item: '생산일보' }
  if (pathname === '/business-management') return businessRouteState(search)
  if (pathname === '/audit') return { category: 'audit', item: '감사 기록' }
  return { category: 'ai', item: 'AI 채팅' }
}

function isStandalonePath(pathname: string) {
  return pathname === '/monthly-production-plan'
    || pathname === '/production-daily'
    || pathname === '/business-management'
    || pathname === '/audit'
}

export default function GlobalMoniSidebarController() {
  const pathname = usePathname()
  const router = useRouter()
  const initialRoute = routeState(pathname)
  const peekCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const standaloneSurface = isStandalonePath(pathname)
  const [visible, setVisible] = useState(standaloneSurface)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileExpandedCategory, setMobileExpandedCategory] = useState<CategoryKey | null>(null)
  const [activeCategory, setActiveCategory] = useState<CategoryKey>(initialRoute.category)
  const [hoveredCategory, setHoveredCategory] = useState<CategoryKey | null>(null)
  const [activeItem, setActiveItem] = useState(initialRoute.item)
  const [isPinned, setIsPinned] = useState(true)
  const [pinPreferenceReady, setPinPreferenceReady] = useState(false)
  const [desktopPeekOpen, setDesktopPeekOpen] = useState(false)
  const expandedCategory = mobileOpen ? mobileExpandedCategory : hoveredCategory
  const desktopSidebarOpen = isPinned || desktopPeekOpen

  const currentCategory = useMemo(
    () => categories.find((category) => category.key === activeCategory),
    [activeCategory],
  )

  function cancelPeekClose() {
    if (!peekCloseTimerRef.current) return
    clearTimeout(peekCloseTimerRef.current)
    peekCloseTimerRef.current = null
  }

  function openDesktopPeek() {
    cancelPeekClose()
    if (!isPinned) setDesktopPeekOpen(true)
  }

  function scheduleDesktopPeekClose() {
    setHoveredCategory(null)
    if (isPinned) return
    cancelPeekClose()
    peekCloseTimerRef.current = setTimeout(() => {
      setDesktopPeekOpen(false)
      peekCloseTimerRef.current = null
    }, PEEK_CLOSE_DELAY_MS)
  }

  useEffect(() => {
    const stored = window.localStorage.getItem(PIN_STORAGE_KEY)
    if (stored === 'false') setIsPinned(false)
    setPinPreferenceReady(true)
  }, [])

  useEffect(() => {
    if (!pinPreferenceReady) return
    window.localStorage.setItem(PIN_STORAGE_KEY, String(isPinned))
    if (isPinned) {
      cancelPeekClose()
      setDesktopPeekOpen(false)
    }
  }, [isPinned, pinPreferenceReady])

  useEffect(() => () => cancelPeekClose(), [])

  useEffect(() => {
    const syncRoute = () => {
      const next = routeState(pathname, window.location.search)
      if (isStandalonePath(pathname)) {
        setActiveCategory(next.category)
        setActiveItem(next.item)
      } else if (pathname === '/') {
        const pending = window.sessionStorage.getItem('moni-pending-nav')
        if (!pending) {
          setActiveCategory('ai')
          setActiveItem('AI 채팅')
        }
      }
    }

    syncRoute()
    window.addEventListener('popstate', syncRoute)
    setHoveredCategory(null)
    setMobileExpandedCategory(null)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [pathname])

  useEffect(() => {
    let attempts = 0
    const applyLayout = () => {
      attempts += 1
      const logoutButton = findDashboardButton('로그아웃')
      const isStandalone = isStandalonePath(pathname)
      setVisible(Boolean(logoutButton) || isStandalone)

      if (pathname === '/monthly-production-plan') {
        const ownAside = document.querySelector<HTMLElement>('main > div > aside')
        if (ownAside) ownAside.style.display = 'none'
      }

      if (pathname === '/business-management') {
        const ownAside = document.querySelector<HTMLElement>('[data-business-management-shell] main > div > aside')
        if (ownAside) ownAside.style.display = 'none'
      }

      if (logoutButton) {
        const dashboardRoot = Array.from(document.querySelectorAll<HTMLElement>('div.flex.min-h-screen'))
          .find((element) => element.className.includes('bg-gray-900'))
        const legacySidebar = dashboardRoot?.firstElementChild as HTMLElement | null
        if (legacySidebar && legacySidebar !== dashboardRoot?.lastElementChild) legacySidebar.style.display = 'none'

        const mainLabels = ['AI 채팅', '생산관리', '회계관리', '영업관리', '관리자', '재무감사']
        for (const label of mainLabels) {
          const button = findDashboardButton(label)
          if (button) button.style.display = 'none'
        }

        const productionLabels = ['생산 개요', '작업 지시', '생산일보', '제품관리', '원재료 관리', '원료수불부', '부재료 관리', '레시피 원재료 연결', '위생점검', '품질 관리', '규정준수 모니터']
        for (const label of productionLabels) {
          const button = findDashboardButton(label)
          if (button) button.style.display = 'none'
        }
      }

      const pending = window.sessionStorage.getItem('moni-pending-nav')
      if (pending && pathname === '/' && logoutButton) {
        try {
          const payload = JSON.parse(pending) as { category: CategoryKey; target: string; label: string; parentTarget?: string }
          const category = categories.find((item) => item.key === payload.category)
          const parentTarget = payload.parentTarget || (category?.label === 'AI 챗팅' ? 'AI 채팅' : category?.label)
          if (parentTarget) clickDashboardTarget(parentTarget)
          window.setTimeout(() => {
            if (clickDashboardTarget(payload.target)) {
              setActiveCategory(payload.category)
              setActiveItem(payload.label)
              window.sessionStorage.removeItem('moni-pending-nav')
            }
          }, 120)
        } catch {
          window.sessionStorage.removeItem('moni-pending-nav')
        }
      }
    }

    applyLayout()
    const observer = new MutationObserver(applyLayout)
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = window.setInterval(() => {
      applyLayout()
      if (attempts > 20) window.clearInterval(timer)
    }, 250)

    return () => {
      observer.disconnect()
      window.clearInterval(timer)
    }
  }, [pathname])

  function openCategory(category: Category) {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobileExpandedCategory((current) => current === category.key ? null : category.key)
      return
    }

    setActiveCategory(category.key)
    const firstItem = category.items[0]
    if (firstItem?.href) {
      setActiveItem(firstItem.label)
      router.push(firstItem.href)
      return
    }

    const target = category.label === 'AI 챗팅' ? 'AI 채팅' : category.label
    if (pathname !== '/') {
      window.sessionStorage.setItem('moni-pending-nav', JSON.stringify({
        category: category.key,
        target,
        label: category.label,
      }))
      router.push('/')
      return
    }
    clickDashboardTarget(target)
  }

  function openItem(category: Category, item: MenuItem) {
    setActiveCategory(category.key)
    setActiveItem(item.label)
    setMobileOpen(false)
    setMobileExpandedCategory(null)

    if (item.href) {
      router.push(item.href)
      return
    }
    if (!item.target) return

    const parentTarget = item.parentTarget || (category.label === 'AI 챗팅' ? 'AI 채팅' : category.label)
    if (pathname !== '/') {
      window.sessionStorage.setItem('moni-pending-nav', JSON.stringify({
        category: category.key,
        target: item.target,
        label: item.label,
        parentTarget,
      }))
      router.push('/')
      return
    }

    clickDashboardTarget(parentTarget)
    window.setTimeout(() => clickDashboardTarget(item.target || ''), 80)
  }

  function togglePinned() {
    setIsPinned((current) => !current)
  }

  if (!visible) return null

  return (
    <>
      <button
        data-moni-global-nav
        type="button"
        aria-label="메뉴 열기"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-[1001] flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-[#07172c] text-xl text-white shadow-xl lg:hidden"
      >☰</button>

      {!isPinned && (
        <div
          data-moni-global-nav
          aria-hidden="true"
          onMouseEnter={openDesktopPeek}
          className="fixed inset-y-0 left-0 z-[1001] hidden w-6 cursor-e-resize lg:block"
        >
          <div className="absolute inset-y-0 left-0 w-1 bg-emerald-400/20 transition-colors duration-200 hover:bg-emerald-400/70" />
        </div>
      )}

      {mobileOpen && (
        <button
          data-moni-global-nav
          aria-label="메뉴 닫기"
          onClick={() => {
            setMobileOpen(false)
            setMobileExpandedCategory(null)
          }}
          className="fixed inset-0 z-[1000] bg-black/65 lg:hidden"
        />
      )}

      <aside
        data-moni-global-sidebar
        onMouseEnter={openDesktopPeek}
        onMouseLeave={scheduleDesktopPeekClose}
        className={`fixed inset-y-0 left-0 z-[1002] flex w-[264px] flex-col border-r border-slate-700/80 bg-[#06172d] text-slate-100 shadow-2xl will-change-transform transition-transform duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${desktopSidebarOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full'}`}
      >
        <div className="flex items-center gap-2 border-b border-slate-700/70 px-4 py-4">
          <button
            data-moni-global-nav
            type="button"
            onClick={() => router.push('/')}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-2xl">🏭</span>
            <span className="min-w-0">
              <b className="block text-2xl tracking-tight">MONI</b>
              <span className="block truncate text-xs text-slate-400">두배 공장 관리</span>
            </span>
          </button>

          <button
            data-moni-global-nav
            type="button"
            aria-pressed={isPinned}
            aria-label={isPinned ? '사이드바 고정 해제' : '사이드바 고정'}
            title={isPinned ? '고정 ON — 클릭하면 비고정' : '고정 OFF — 클릭하면 고정'}
            onClick={togglePinned}
            className={`hidden shrink-0 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-bold transition lg:flex ${
              isPinned
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                : 'border-slate-600 bg-slate-800 text-slate-300'
            }`}
          >
            <span>{isPinned ? '고정' : '비고정'}</span>
            <span className={`relative h-4 w-8 rounded-full transition ${isPinned ? 'bg-emerald-500' : 'bg-slate-600'}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${isPinned ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {categories.map((category) => {
            const expanded = expandedCategory === category.key
            const active = activeCategory === category.key
            return (
              <div
                key={category.key}
                onMouseEnter={() => {
                  if (window.innerWidth >= 1024) setHoveredCategory(category.key)
                }}
                onMouseLeave={() => setHoveredCategory(null)}
                className="mb-1"
              >
                <button
                  data-moni-global-nav
                  type="button"
                  onClick={() => openCategory(category)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition ${
                    active ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-emerald-500/20' : 'bg-slate-800'}`}>{category.icon}</span>
                  <span className="flex-1">{category.label}</span>
                  <span className={`text-xs transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>⌄</span>
                </button>

                <div className={`grid transition-all duration-300 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="ml-7 mt-1 border-l border-slate-700/80 pl-3">
                      {category.items.map((item) => (
                        <button
                          data-moni-global-nav
                          key={item.label}
                          type="button"
                          onClick={() => openItem(category, item)}
                          className={`mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                            activeItem === item.label ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                          }`}
                        >{item.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </nav>

        <div className="border-t border-slate-700/70 p-4 text-xs text-slate-500">
          <div className="rounded-xl bg-slate-900/60 px-3 py-2">
            현재 영역: <b className="text-slate-300">{currentCategory?.label}</b>
          </div>
        </div>
      </aside>

      <style jsx global>{`
        html,
        body {
          min-height: 100%;
          background-color: #071426 !important;
        }

        body.moni-global-sidebar-active {
          box-sizing: border-box;
          width: 100%;
          overflow-x: hidden;
          transition: padding-left 360ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: padding-left;
        }

        @media (min-width: 1024px) {
          body.moni-sidebar-offset-active {
            padding-left: var(--moni-sidebar-width);
          }

          body.moni-global-sidebar-active [class~='fixed'][class~='inset-0']:not([data-moni-global-nav]):not([data-moni-global-sidebar]) {
            transition:
              left 360ms cubic-bezier(0.22, 1, 0.36, 1),
              width 360ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          body.moni-sidebar-offset-active [class~='fixed'][class~='inset-0']:not([data-moni-global-nav]):not([data-moni-global-sidebar]) {
            left: var(--moni-sidebar-width) !important;
          }

          body.moni-sidebar-offset-active [class~='w-screen'] {
            width: calc(100vw - var(--moni-sidebar-width)) !important;
          }
        }

        body.moni-global-sidebar-active main,
        body.moni-global-sidebar-active main.min-h-screen > div.mx-auto {
          min-width: 0;
          max-width: none;
          background-color: #071426;
        }

        body.moni-global-sidebar-active [data-moni-global-sidebar] {
          font-family: inherit;
          backface-visibility: hidden;
          transform-style: preserve-3d;
        }
      `}</style>
    </>
  )
}
