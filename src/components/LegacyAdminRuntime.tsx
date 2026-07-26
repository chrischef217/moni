'use client'

import RawMaterialLedgerPrintController from '@/components/RawMaterialLedgerPrintController'
import RawMaterialUnitPriceController from '@/components/RawMaterialUnitPriceController'
import RawMaterialTypeFilterController from '@/components/RawMaterialTypeFilterController'
import ProductionCompletionMetadataController from '@/components/ProductionCompletionMetadataController'
import WorkOrderGramController from '@/components/WorkOrderGramController'
import ProductionDashboardController from '@/components/ProductionDashboardController'
import LegacyAiChatLayoutController from '@/components/LegacyAiChatLayoutController'

export default function LegacyAdminRuntime() {
  return (
    <>
      <LegacyAiChatLayoutController />
      <RawMaterialLedgerPrintController />
      <RawMaterialUnitPriceController />
      <RawMaterialTypeFilterController />
      <ProductionCompletionMetadataController />
      <WorkOrderGramController />
      <ProductionDashboardController />
    </>
  )
}
