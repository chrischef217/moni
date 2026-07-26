'use client'

import RawMaterialLedgerPrintController from '@/components/RawMaterialLedgerPrintController'
import RawMaterialUnitPriceController from '@/components/RawMaterialUnitPriceController'
import RawMaterialTypeFilterController from '@/components/RawMaterialTypeFilterController'
import ProductionCompletionMetadataController from '@/components/ProductionCompletionMetadataController'
import WorkOrderGramController from '@/components/WorkOrderGramController'
import ProductionDashboardController from '@/components/ProductionDashboardController'

export default function LegacyAdminRuntime() {
  return (
    <>
      <RawMaterialLedgerPrintController />
      <RawMaterialUnitPriceController />
      <RawMaterialTypeFilterController />
      <ProductionCompletionMetadataController />
      <WorkOrderGramController />
      <ProductionDashboardController />
    </>
  )
}
