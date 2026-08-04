import { z } from 'zod'
import type { MoniToolDefinition } from '@/lib/moni/agent/tools/types'

const DateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish()
const Query = z.string().trim().min(1).max(200).nullish()
const Rows100 = z.number().int().min(1).max(100).nullish()

export const commercialToolDefinitions: MoniToolDefinition[] = [
  {
    name: 'search_sales_and_receivables',
    description: '기간·거래처·제품별 판매, 수금, 미수금을 조회한다.',
    parameters: z.object({
      start_date: DateValue,
      end_date: DateValue,
      client_query: Query,
      product_query: Query,
      outstanding_only: z.boolean().nullish(),
      limit: Rows100,
    }),
  },
  {
    name: 'search_purchases_and_payables',
    description: '기간·매입처·품목별 실제 매입, 지급, 미지급금을 조회하고 거래처 명세서 잔액을 별도 반환한다.',
    parameters: z.object({
      start_date: DateValue,
      end_date: DateValue,
      supplier_query: Query,
      item_query: Query,
      outstanding_only: z.boolean().nullish(),
      limit: Rows100,
    }),
  },
]
