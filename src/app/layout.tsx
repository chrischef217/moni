import type { Metadata } from 'next'
import { Suspense } from 'react'
import GlobalMoniSidebarController from '@/components/GlobalMoniSidebarController'
import GlobalSidebarLayoutController from '@/components/GlobalSidebarLayoutController'
import SidebarPinToggleVisualFix from '@/components/SidebarPinToggleVisualFix'
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
import './production-dashboard-motion.css'

export const metadata: Metadata = {
  title: 'Moni — 경영 고민? 모니한테 물어봐',
  description: '한국 소규모 식품 공장을 위한 AI 경영관리 도우미',
  icons: { icon: '/favicon.ico' },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionFromCookies()
  const showAdminChrome = session?.role === 'admin'

  return (
    <html lang="ko">
      <body className="antialiased">
        {showAdminChrome ? (
          <MoniWeatherShell>
            <GlobalMoniSidebarController />
            <GlobalSidebarLayoutController />
            <SidebarPinToggleVisualFix />
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
