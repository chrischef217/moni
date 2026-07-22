import type { Metadata } from 'next'
import RawMaterialLedgerPrintController from '@/components/RawMaterialLedgerPrintController'
import MonthlyProductionRequirementPrintController from '@/components/MonthlyProductionRequirementPrintController'
import MonthlyProductionRequirementSafetyGuard from '@/components/MonthlyProductionRequirementSafetyGuard'
import MonthlyProductionPurchaseBudgetController from '@/components/MonthlyProductionPurchaseBudgetController'
import RawMaterialUnitPriceController from '@/components/RawMaterialUnitPriceController'
import GlobalMoniSidebarController from '@/components/GlobalMoniSidebarController'
import GlobalSidebarLayoutController from '@/components/GlobalSidebarLayoutController'
import ProductionCompletionMetadataController from '@/components/ProductionCompletionMetadataController'
import BusinessManagementMenuController from '@/components/BusinessManagementMenuController'
import WorkOrderGramController from '@/components/WorkOrderGramController'
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
        <MonthlyProductionRequirementPrintController />
        <MonthlyProductionRequirementSafetyGuard />
        <MonthlyProductionPurchaseBudgetController />
        <RawMaterialUnitPriceController />
        <GlobalMoniSidebarController />
        <GlobalSidebarLayoutController />
        <ProductionCompletionMetadataController />
        <BusinessManagementMenuController />
        <WorkOrderGramController />
        {children}
      </body>
    </html>
  )
}
