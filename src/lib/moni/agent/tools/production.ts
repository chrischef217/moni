import { z } from 'zod'
import type { MoniToolDefinition } from '@/lib/moni/agent/tools/types'

const DateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
const Query = z.string().trim().min(1).max(200).optional()
const Rows100 = z.number().int().min(1).max(100).optional()

export const productionToolDefinitions: MoniToolDefinition[] = [
  {
    name: 'search_production_records',
    description: '기간·제품·상태별 생산 작업지시와 완료실적을 조회한다. 미완료는 open_work_order_count와 open_planned_quantity_g로 판단한다.',
    parameters: z.object({
      start_date: DateValue,
      end_date: DateValue,
      product_query: Query,
      status: z.string().trim().min(1).max(80).optional(),
      limit: Rows100,
    }),
  },
  {
    name: 'search_production_plans',
    description: '기간·제품별 월간 생산계획을 조회한다. 작업지시의 계획량·완료실적과 별도 데이터로 취급한다.',
    parameters: z.object({ start_date: DateValue, end_date: DateValue, product_query: Query, limit: Rows100 }),
  },
  {
    name: 'search_products_and_recipes',
    description: '제품 마스터, 레시피, 원재료 매핑을 검색한다.',
    parameters: z.object({
      product_query: Query,
      active_only: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  },
]
