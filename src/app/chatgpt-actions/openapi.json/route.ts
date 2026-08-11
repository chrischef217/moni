import { NextResponse } from 'next/server'
import { listMcpToolsForRole } from '@/lib/moni/mcp/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function GET() {
  const tools = listMcpToolsForRole('admin').filter((tool) => ACTION_TOOLS.has(tool.name))
  const paths = Object.fromEntries(tools.map((tool) => [
    `/chatgpt-actions/tools/${tool.name}`,
    {
      post: {
        operationId: tool.name,
        summary: tool.title,
        description: `${tool.description} MONI 서버는 모델 추론을 하지 않으며 실제 회사 데이터만 읽기 전용으로 반환합니다.`,
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
            content: {
              'application/json': {
                schema: {
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
                },
              },
            },
          },
          '401': { description: 'MONI GPT Action 인증 실패' },
          '403': { description: '현재 역할에서 허용되지 않은 조회' },
          '400': { description: '조회 인자 또는 데이터 조회 실패' },
        },
      },
    },
  ]))

  return NextResponse.json({
    openapi: '3.1.0',
    info: {
      title: 'MONI Read-Only Business Data Actions',
      version: '1.0.0',
      description: 'ChatGPT 제품 자체가 지능·대화·판단을 담당하고 MONI는 두배식품의 실제 생산·재고·판매·수금·매입·회사 문맥 데이터만 읽기 전용으로 제공하는 GPT Actions API입니다.',
    },
    servers: [{ url: 'https://moni-sigma.vercel.app' }],
    paths,
    components: {
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
