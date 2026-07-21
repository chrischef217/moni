import type { Metadata } from 'next'
import RawMaterialLedgerPrintController from '@/components/RawMaterialLedgerPrintController'
import MonthlyProductionPlanNavController from '@/components/MonthlyProductionPlanNavController'
import MonthlyProductionRequirementPrintController from '@/components/MonthlyProductionRequirementPrintController'
import GlobalMoniSidebarController from '@/components/GlobalMoniSidebarController'
import './globals.css'

export const metadata: Metadata = {
  title: 'Moni — 경영 고민? 모니한테 물어봐',
  description: '한국 소규모 식품 공장을 위한 AI 경영관리 도우미',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <RawMaterialLedgerPrintController />
        <MonthlyProductionPlanNavController />
        <MonthlyProductionRequirementPrintController />
        <GlobalMoniSidebarController />
        {children}
      </body>
    </html>
  )
}
