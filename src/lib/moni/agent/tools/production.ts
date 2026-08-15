import { z } from 'zod'
import type { MoniToolDefinition } from '@/lib/moni/agent/tools/types'

const DateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
const Query = z.string().trim().min(1).max(200).optional()
const Rows100 = z.number().int().min(1).max(100).optional()
const ProductionStatus = z.enum(['planned', '완료', 'cancelled', 'confirmed', 'confirming']).optional()

export const productionToolDefinitions: MoniToolDefinition[] = [
  {
    name: 'search_production_records',
    description: '기간·제품·LOT·상태별 생산 작업지시와 완료실적을 조회한다. 사용자가 LOT 번호를 정확히 말하면 product_query가 아니라 lot_query에 그 LOT를 그대로 넣어 조회한다. 상태 필터는 DB의 정식 값 planned, 완료, cancelled, confirmed, confirming 중 하나만 사용한다. 예정/PLANNED는 planned, 완료/COMPLETED는 완료, 취소/CANCELLED는 cancelled로 해석한다. 미완료는 open_work_order_count와 open_planned_quantity_g로 판단한다.',
    parameters: z.object({
      start_date: DateValue,
      end_date: DateValue,
      product_query: Query,
      lot_query: Query,
      status: ProductionStatus,
      limit: Rows100,
    }),
  },
  {
    name: 'search_production_plans',
    description: '기간·제품별 월간 생산계획을 조회한다. 작업지시의 계획량·완료실적과 별도 데이터로 취급한다. data_quality_warnings가 있으면 kg/g 단위 또는 입력값 검증 전에는 작업지시 발행이나 생산 착수를 권고하지 않는다.',
    parameters: z.object({ start_date: DateValue, end_date: DateValue, product_query: Query, limit: Rows100 }),
  },
  {
    name: 'search_products_and_recipes',
    description: '제품 마스터, 레시피, 원재료 매핑을 검색한다. 정확한 제품명이 공식 마스터에 없으면 유사 제품을 같은 제품이라고 단정하지 않는다.',
    parameters: z.object({
      product_query: Query,
      active_only: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  },
]
