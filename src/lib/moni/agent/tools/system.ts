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
    description: 'MONI의 확정 의사결정·운영 원칙·PMO 문맥뿐 아니라 MONI 자체 기능, 메뉴 위치, 사용법, 입력 위치를 검색한다. 사용자가 “어디서 해?”, “어떻게 바꿔?”, “무슨 메뉴야?”, “단가/가격/등록/수정은 어디서?”처럼 MONI 사용법을 묻는 경우에는 추측하지 말고 반드시 이 도구를 먼저 호출한다. query에는 사용자의 긴 문장 전체가 아니라 핵심 기능명/업무명(예: “원재료 단가”, “택배비”, “반품”, “매입 입고”)을 넣는다.',
    parameters: z.object({
      query: z.string().trim().min(1).max(200).optional(),
      limit: z.number().int().min(1).max(20).optional(),
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
