import { NextResponse } from 'next/server'
import { listMcpToolsForRole } from '@/lib/moni/mcp/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Stable public production origin. Verified from outside Vercel Authentication
// with authenticated MONI Action requests.
const CHATGPT_ACTION_PUBLIC_ORIGIN = 'https://moni-sigma.vercel.app'

const ACTION_TOOLS = new Set([
  'get_business_clock',
  'get_company_context',
  'search_production_records',
  'search_production_plans',
  'get_raw_material_inventory',
  'search_raw_material_transactions',
  'search_sales_and_receivables',
  'search_purchases_and_payables',
  'search_products_and_recipes',
])

function standardSuccessSchema() {
  return {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      integration: { type: 'string' },
      intelligence_runtime: { type: 'string' },
      moni_server_model_inference: { type: 'boolean' },
      tool: { type: 'string' },
      result: { type: 'object', additionalProperties: true },
    },
    required: ['ok', 'integration', 'intelligence_runtime', 'moni_server_model_inference', 'tool', 'result'],
  }
}

export async function GET() {
  const tools = listMcpToolsForRole('admin').filter((tool) => ACTION_TOOLS.has(tool.name))
  const readPaths = Object.fromEntries(tools.map((tool) => [
    `/chatgpt-actions/tools/${tool.name}`,
    {
      post: {
        operationId: tool.name,
        summary: tool.title,
        description: `${tool.description} ChatGPT 자체가 지능·추론을 담당하며 MONI 서버는 별도 AI 모델을 실행하지 않습니다.`,
        security: [{ moniActionKey: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: tool.inputSchema,
            },
          },
        },
        responses: {
          '200': {
            description: 'MONI 실제 데이터 조회 성공',
            content: { 'application/json': { schema: standardSuccessSchema() } },
          },
          '401': { description: 'MONI GPT Action 인증 실패' },
          '403': { description: '현재 역할에서 허용되지 않은 조회' },
          '400': { description: '조회 인자 또는 데이터 조회 실패' },
        },
      },
    },
  ]))

  const writePaths = {
    '/chatgpt-actions/write/production-plan/prepare': {
      post: {
        operationId: 'prepare_production_plan_change',
        summary: '생산계획 변경 미리보기 및 승인 건 생성',
        description: '월간 생산계획 등록·수정·삭제를 준비합니다. 실제 DB 변경은 하지 않습니다. 반드시 결과의 preview_text와 warnings를 사용자에게 보여주고, 새로운 사용자 메시지에서 명시적 승인을 받은 뒤에만 execute_production_plan_change를 호출해야 합니다. 생산량 입력 단위는 kg입니다.',
        security: [{ moniActionKey: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['CREATE', 'UPDATE', 'DELETE'],
                    description: '등록 CREATE, 수정 UPDATE, 삭제 DELETE',
                  },
                  plan_id: {
                    type: 'string',
                    format: 'uuid',
                    description: 'UPDATE 또는 DELETE 대상 생산계획 ID. CREATE에서는 생략합니다.',
                  },
                  plan_date: {
                    type: 'string',
                    format: 'date',
                    description: 'CREATE 시 필수. UPDATE 시 변경할 때만 전달합니다.',
                  },
                  product_id: {
                    type: 'string',
                    description: 'CREATE 시 필수. UPDATE 시 제품을 변경할 때만 전달합니다. search_products_and_recipes 또는 search_production_plans로 실제 ID를 확인합니다.',
                  },
                  planned_quantity_kg: {
                    type: 'number',
                    exclusiveMinimum: 0,
                    description: '생산예정량 kg. 서버가 정확히 한 번 ×1000하여 planned_quantity_g로 저장합니다.',
                  },
                  note: {
                    type: 'string',
                    description: '비고. 빈 문자열이면 비고를 제거합니다.',
                  },
                  reason: {
                    type: 'string',
                    description: '사용자 요청 또는 변경 이유를 짧게 기록합니다.',
                  },
                },
                required: ['action'],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '200': {
            description: '실행 미리보기와 confirmation_id 생성 성공. 아직 DB는 변경되지 않음.',
            content: { 'application/json': { schema: standardSuccessSchema() } },
          },
          '401': { description: 'MONI GPT Action 인증 실패' },
          '400': { description: '입력 검증, 단위 안전검증 또는 승인 건 생성 실패' },
        },
      },
    },
    '/chatgpt-actions/write/production-plan/execute': {
      post: {
        operationId: 'execute_production_plan_change',
        summary: '승인된 생산계획 변경 실행',
        description: 'prepare_production_plan_change 결과를 사용해 실제 생산계획 변경을 실행합니다. prepare 호출과 같은 답변 턴에서는 호출하면 안 됩니다. 반드시 미리보기 이후 새로운 사용자 메시지에서 명시적 승인을 받은 경우에만 호출합니다.',
        security: [{ moniActionKey: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  confirmation_id: {
                    type: 'string',
                    format: 'uuid',
                    description: '직전 prepare_production_plan_change가 발급한 confirmation_id',
                  },
                  user_confirmation_text: {
                    type: 'string',
                    minLength: 1,
                    description: '미리보기 이후 사용자가 새 메시지에서 실제로 보낸 승인 문구',
                  },
                },
                required: ['confirmation_id', 'user_confirmation_text'],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '200': {
            description: '승인된 생산계획 변경 실행 및 DB 재검증 성공',
            content: { 'application/json': { schema: standardSuccessSchema() } },
          },
          '401': { description: 'MONI GPT Action 인증 실패' },
          '400': { description: '승인 만료, 중복 실행, 대상 불일치 또는 DB 변경 실패' },
        },
      },
    },
  }

  return NextResponse.json({
    openapi: '3.1.0',
    info: {
      title: 'MONI Business Operations Actions',
      version: '1.1.0',
      description: 'ChatGPT 제품 자체가 지능·대화·판단을 담당하고 MONI는 두배의 실제 생산·재고·판매·수금·매입·회사 문맥 데이터를 제공하며, 승인 절차를 거친 월간 생산계획 변경을 실행하는 GPT Actions API입니다. MONI 서버 자체에서는 별도 AI 모델 추론을 하지 않습니다.',
    },
    servers: [{ url: CHATGPT_ACTION_PUBLIC_ORIGIN }],
    paths: {
      ...readPaths,
      ...writePaths,
    },
    components: {
      schemas: {},
      securitySchemes: {
        moniActionKey: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'MONI-GPT-ACTION-KEY',
        },
      },
    },
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Access-Control-Allow-Origin': 'https://chatgpt.com',
    },
  })
}
