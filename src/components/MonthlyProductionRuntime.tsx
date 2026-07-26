'use client'

import MonthlyProductionRequirementPrintController from '@/components/MonthlyProductionRequirementPrintController'
import MonthlyProductionRequirementSafetyGuard from '@/components/MonthlyProductionRequirementSafetyGuard'
import MonthlyProductionPurchaseBudgetController from '@/components/MonthlyProductionPurchaseBudgetController'
import MonthlyProductionCalendarDayStyleController from '@/components/MonthlyProductionCalendarDayStyleController'
import MonthlyPlanToWorkOrderController from '@/components/MonthlyPlanToWorkOrderController'

export default function MonthlyProductionRuntime() {
  return (
    <>
      <MonthlyProductionRequirementPrintController />
      <MonthlyProductionRequirementSafetyGuard />
      <MonthlyProductionPurchaseBudgetController />
      <MonthlyProductionCalendarDayStyleController />
      <MonthlyPlanToWorkOrderController />
    </>
  )
}
