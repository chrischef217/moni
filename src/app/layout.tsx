import type { Metadata } from 'next'
import { Suspense } from 'react'
import GlobalMoniSidebarRouteBoundary from '@/components/GlobalMoniSidebarRouteBoundary'
import GlobalSidebarLayoutController from '@/components/GlobalSidebarLayoutController'
import GlobalSidebarAutoHeightController from '@/components/GlobalSidebarAutoHeightController'
import GlobalInteractiveContrastController from '@/components/GlobalInteractiveContrastController'
import GlobalReadableInteractiveTextController from '@/components/GlobalReadableInteractiveTextController'
import SalesManagementMenuController from '@/components/SalesManagementMenuController'
import DocumentManagementMenuController from '@/components/DocumentManagementMenuController'
import PurchaseManagementMenuController from '@/components/PurchaseManagementMenuController'
import LegacyInboundEntryRedirectController from '@/components/LegacyInboundEntryRedirectController'
import DocumentManagementWorkspace from '@/components/DocumentManagementWorkspace'
import SidebarPinToggleVisualFix from '@/components/SidebarPinToggleVisualFix'
import SidebarSubmenuMotionController from '@/components/SidebarSubmenuMotionController'
import SidebarClickAccordionController from '@/components/SidebarClickAccordionController'
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

const loginCriticalStyle = String.raw`
html, body {
  min-height: 100%;
  margin: 0;
}

[data-moni-login] {
  position: fixed;
  inset: 0;
  display: flex;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 24px;
  box-sizing: border-box;
  color: #173b52;
  background:
    radial-gradient(circle at 84% 0%, rgb(134 207 255 / 0.24), transparent 30%),
    radial-gradient(circle at 9% 100%, rgb(171 216 246 / 0.22), transparent 34%),
    linear-gradient(145deg, rgb(246 251 255), rgb(231 242 252));
  font-family: Pretendard, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

[data-moni-login] *,
[data-moni-login] *::before,
[data-moni-login] *::after {
  box-sizing: border-box;
}

[data-moni-login] .moni-login-card {
  position: relative;
  z-index: 1;
  width: min(100%, 440px);
  border: 1px solid rgb(171 199 217 / 0.62);
  border-radius: 32px;
  background: rgb(255 255 255 / 0.88);
  padding: 40px 38px 36px;
  box-shadow: 0 26px 70px rgb(15 35 55 / 0.14);
}

[data-moni-login] .moni-login-character {
  width: 82px;
  height: 82px;
  margin: 0 auto 24px;
  border-radius: 28px;
  background: #0c2337;
}

[data-moni-login] .moni-login-title {
  margin: 0;
  color: #173b52;
  font-size: clamp(24px, 5vw, 29px);
  font-weight: 800;
  line-height: 1.28;
  letter-spacing: -0.035em;
  text-align: center;
}

[data-moni-login] .moni-login-form {
  display: grid;
  gap: 16px;
  margin-top: 32px;
}

[data-moni-login] .moni-login-field {
  display: grid;
  gap: 8px;
  color: #526f7e;
  font-size: 13px;
  font-weight: 700;
}

[data-moni-login] .moni-login-field input {
  width: 100%;
  height: 50px;
  border: 1px solid rgb(171 199 217 / 0.72);
  border-radius: 14px;
  background: rgb(255 255 255 / 0.94);
  padding: 0 15px;
  color: #173b52;
  font: inherit;
}

[data-moni-login] .moni-login-submit {
  width: 100%;
  min-height: 52px;
  margin-top: 24px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #2f80c9, #1769aa);
  color: white;
  font: inherit;
  font-weight: 800;
}

@media (max-width: 520px) {
  [data-moni-login] { padding: 16px; }
  [data-moni-login] .moni-login-card {
    border-radius: 26px;
    padding: 34px 22px 28px;
  }
}
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
        <style data-moni-login-critical dangerouslySetInnerHTML={{ __html: loginCriticalStyle }} />
        <script dangerouslySetInnerHTML={{ __html: staleAssetRecoveryScript }} />
      </head>
      <body className="antialiased">
        {showAdminChrome ? (
          <MoniWeatherShell>
            <Suspense fallback={null}>
              <GlobalMoniSidebarRouteBoundary />
            </Suspense>
            <GlobalSidebarLayoutController />
            <GlobalSidebarAutoHeightController />
            <GlobalInteractiveContrastController />
            <GlobalReadableInteractiveTextController />
            <SalesManagementMenuController />
            <DocumentManagementMenuController />
            <PurchaseManagementMenuController />
            <LegacyInboundEntryRedirectController />
            <SidebarPinToggleVisualFix />
            <SidebarSubmenuMotionController />
            <SidebarClickAccordionController />
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
            <DocumentManagementWorkspace />
            <DeferredGlobalMoniAgent />
          </MoniWeatherShell>
        ) : children}
      </body>
    </html>
  )
}
