import { z } from 'zod'
import type { MoniToolDefinition } from '@/lib/moni/agent/tools/types'

const DateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
const Query = z.string().trim().min(1).max(200).optional()
const Rows100 = z.number().int().min(1).max(100).optional()

export const inventoryToolDefinitions: MoniToolDefinition[] = [
  {
    name: 'get_raw_material_inventory',
    description: '원재료 현재재고와 마스터 정보를 조회한다. 임의의 부족 기준은 적용하지 않는다.',
    parameters: z.object({
      material_query: Query,
      out_of_stock_only: z.boolean().optional(),
      active_only: z.boolean().optional(),
      limit: Rows100,
    }),
  },
  {
    name: 'search_raw_material_transactions',
    description: '기간·원재료·입출고 유형별 원재료 입출고 원장을 조회한다. 중요: 사용자가 실제로 받은 원재료, 실제 입고량, 매입 입고, 기간 내 가장 많이 입고된 원재료를 묻는 경우 note에 MONI_STOCK_RECONCILIATION이 포함된 INBOUND 행은 기초재고/재고보정용 내부 행이므로 실제 입고에서 반드시 제외한다. 같은 원재료의 정상 INBOUND가 여러 건이면 기간 내 합산해서 비교한다. 재고보정 자체를 감사하거나 현재재고 형성 과정을 묻는 경우에만 해당 보정행을 별도로 설명한다.',
    parameters: z.object({
      start_date: DateValue,
      end_date: DateValue,
      material_query: Query,
      transaction_type: z.enum(['INBOUND', 'OUTBOUND']).optional(),
      limit: Rows100,
    }),
  },
]
