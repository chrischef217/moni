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
    description: '기간·원재료·입출고 유형별 원재료 입출고 원장을 조회한다.',
    parameters: z.object({
      start_date: DateValue,
      end_date: DateValue,
      material_query: Query,
      transaction_type: z.enum(['INBOUND', 'OUTBOUND']).optional(),
      limit: Rows100,
    }),
  },
]
