import { z } from 'zod'
import type { MoniToolDefinition } from '@/lib/moni/agent/tools/types'
import { PmoEventInputSchema } from '@/lib/moni/agent/pmo'

export const systemToolDefinitions: MoniToolDefinition[] = [
  {
    name: 'get_business_clock',
    description: '현재 공장 기준일과 사용자 기준일을 확인한다. 상대 날짜 해석이 필요할 때 사용한다.',
    parameters: z.object({}),
  },
  {
    name: 'get_company_context',
    description: 'MONI의 확정 의사결정, 운영 원칙, PMO 기준과 장기 프로젝트 문맥을 검색한다.',
    parameters: z.object({
      query: z.string().trim().min(1).max(200).nullish(),
      limit: z.number().int().min(1).max(20).nullish(),
    }),
  },
  {
    name: 'get_agent_capabilities',
    description: '현재 사용자의 역할에 따라 허용된 MONI Agent 도구와 READ ONLY 제한을 확인한다.',
    parameters: z.object({}),
  },
  {
    name: 'report_pmo_event',
    description: '검증 가능한 오류·데이터품질·보안·기능공백을 증거와 함께 GPT(PMO) 검토 큐에 접수한다. 접수는 수정 완료가 아니다.',
    parameters: PmoEventInputSchema,
  },
]
