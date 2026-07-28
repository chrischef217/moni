import type { Metadata } from 'next'
import { Suspense } from 'react'
import GlobalMoniSidebarRouteBoundary from '@/components/GlobalMoniSidebarRouteBoundary'
import GlobalSidebarLayoutController from '@/components/GlobalSidebarLayoutController'
import SalesManagementMenuController from '@/components/SalesManagementMenuController'
import SidebarPinToggleVisualFix from '@/components/SidebarPinToggleVisualFix'
import SidebarSubmenuMotionController from '@/components/SidebarSubmenuMotionController'
import SidebarExportDestinationLabelController from '@/components/SidebarExportDestinationLabelController'
import SidebarDashboardLabelController from '@/components/SidebarDashboardLabelController'
import SidebarMenuOrderController from '@/components/SidebarMenuOrderController'
import SidebarAdminMenuController from '@/components/SidebarAdminMenuController'
import ModalNavigationDismissGuard from '@/components/ModalNavigationDismissGuard'
import MoniWeatherShell from '@/components/MoniWeatherShell'
import DeferredGlobalMoniAgent from '@/components/DeferredGlobalMoniAgent'
import GlobalAlertSyncController from '@/components/GlobalAlertSyncController'
import AdminRouteRuntime from '@/components/AdminRouteRuntime'
import { getSessionFromCookies } from '@/lib/allowance/session'
import './globals.css'
import './moni-glass-tokens.css'
import './moni-weather-shell.css'
import './moni-weather-shell-interaction.css'
import './moni-glass-theme.css'
import './moni-production-glass.css'
import './moni-production-daily-fix.css'
import './moni-production-shell-fixes.css'
import './moni-raw-ledger-design.css'
import './moni-modal-centering.css'
import './moni-business-glass.css'
import './moni-final-glass-pass.css'
import './moni-control-tower-hierarchy.css'
import './moni-control-tower-reference.css'
import './moni-control-tower-readable.css'
import './moni-weather-card-reference.css'
import './moni-control-tower-wisdom.css'
import './moni-control-tower-alerts.css'
import './monthly-production-calendar.css'
import './moni-monthly-calendar-glass-popover.css'
import './moni-monthly-requirement-design.css'
import './moni-legacy-ai-chat.css'
import './moni-sidebar-motion.css'
import './production-dashboard-motion.css'
import './moni-action-button-contrast.css'
import './moni-export-statement-typography-fix.css'
import './moni-export-document-table-balance.css'

export const metadata: Metadata = {
  title: 'Moni — 경영 고민? 모니한테 물어봐',
  description: '한국 소규모 식품 공장을 위한 AI 경영관리 도우미',
  icons: { icon: '/favicon.ico' },
}

const staleAssetRecoveryScript = String.raw`
(() => {
  const STORAGE_KEY = 'moni-stale-asset-recovery-at'
  const QUERY_KEY = '__moni_refresh'

  const recover = () => {
    try {
      const now = Date.now()
      const last = Number(window.sessionStorage.getItem(STORAGE_KEY) || 0)
      if (last && now - last < 15000) return
      window.sessionStorage.setItem(STORAGE_KEY, String(now))

      const url = new URL(window.location.href)
      url.searchParams.set(QUERY_KEY, String(now))
      window.location.replace(url.toString())
    } catch {
      window.location.reload()
    }
  }

  const isNextStaticAsset = (value) => typeof value === 'string' && value.includes('/_next/static/')

  window.addEventListener('error', (event) => {
    const target = event.target
    if (!target || target === window) return
    const assetUrl = target.src || target.href || ''
    if (isNextStaticAsset(assetUrl)) recover()
  }, true)

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = String(reason?.message || reason || '')
    if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|CSS_CHUNK_LOAD_FAILED/i.test(message)) {
      recover()
    }
  })

  window.addEventListener('load', () => {
    window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY)
        const url = new URL(window.location.href)
        if (url.searchParams.has(QUERY_KEY)) {
          url.searchParams.delete(QUERY_KEY)
          window.history.replaceState(window.history.state, '', url.toString())
        }
      } catch {
        // Recovery bookkeeping must never block MONI rendering.
      }
    }, 5000)
  }, { once: true })
})()
`

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionFromCookies()
  const showAdminChrome = session?.role === 'admin'

  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: staleAssetRecoveryScript }} />
      </head>
      <body className="antialiased">
        {showAdminChrome ? (
          <MoniWeatherShell>
            <Suspense fallback={null}>
              <GlobalMoniSidebarRouteBoundary />
            </Suspense>
            <GlobalSidebarLayoutController />
            <SalesManagementMenuController />
            <SidebarPinToggleVisualFix />
            <SidebarSubmenuMotionController />
            <SidebarExportDestinationLabelController />
            <SidebarDashboardLabelController />
            <SidebarMenuOrderController />
            <SidebarAdminMenuController />
            <ModalNavigationDismissGuard />
            <Suspense fallback={null}>
              <AdminRouteRuntime />
            </Suspense>
            <GlobalAlertSyncController />
            {children}
            <DeferredGlobalMoniAgent />
          </MoniWeatherShell>
        ) : children}
      </body>
    </html>
  )
}
