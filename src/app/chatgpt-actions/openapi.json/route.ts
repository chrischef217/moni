import { NextResponse } from 'next/server'
import { listMcpToolsForRole } from '@/lib/moni/mcp/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function executeSchema() {
  return {
    type: 'object',
    properties: {
      confirmation_id: {
        type: 'string',
        format: 'uuid',
        description: '직전 prepare Action이 발급한 confirmation_id',
      },
      user_confirmation_text: {
        type: 'string',
        minLength: 1,
        description: '미리보기 이후 사용자가 새 메시지에서 실제로 보낸 승인 문구',
      },
    },
    required: ['confirmation_id', 'user_confirmation_text'],
    additionalProperties: false,
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
          content: { 'application/json': { schema: tool.inputSchema } },
        },
        responses: {
          '200': { description: 'MONI 실제 데이터 조회 성공', content: { 'application/json': { schema: standardSuccessSchema() } } },
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
        description: '월간 생산계획 등록·수정·삭제를 준비합니다. 실제 DB 변경은 하지 않습니다. 반드시 미리보기를 사용자에게 보여주고 새로운 사용자 메시지에서 승인을 받은 뒤 execute_production_plan_change를 호출합니다. 수량 단위는 kg입니다.',
        security: [{ moniActionKey: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  action: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE'] },
                  plan_id: { type: 'string', format: 'uuid' },
                  plan_date: { type: 'string', format: 'date' },
                  product_id: { type: 'string' },
                  planned_quantity_kg: { type: 'number', exclusiveMinimum: 0 },
                  note: { type: 'string' },
                  reason: { type: 'string' },
                },
                required: ['action'],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '200': { description: '생산계획 실행 미리보기 생성 성공. DB 미변경.', content: { 'application/json': { schema: standardSuccessSchema() } } },
          '401': { description: 'MONI GPT Action 인증 실패' },
          '400': { description: '입력 검증, 단위 안전검증 또는 승인 건 생성 실패' },
        },
      },
    },
    '/chatgpt-actions/write/production-plan/execute': {
      post: {
        operationId: 'execute_production_plan_change',
        summary: '승인된 생산계획 변경 실행',
        description: 'prepare_production_plan_change 이후 새로운 사용자 메시지에서 명시적으로 승인한 경우에만 실제 생산계획 변경을 실행합니다.',
        security: [{ moniActionKey: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: executeSchema() } } },
        responses: {
          '200': { description: '생산계획 변경 및 DB 재검증 성공', content: { 'application/json': { schema: standardSuccessSchema() } } },
          '401': { description: 'MONI GPT Action 인증 실패' },
          '400': { description: '승인 만료, 중복 실행, 대상 불일치 또는 DB 변경 실패' },
        },
      },
    },
    '/chatgpt-actions/write/production/prepare': {
      post: {
        operationId: 'prepare_production_operation',
        summary: '생산 작업지시·완료·확정 실행 미리보기 생성',
        description: '생산 작업지시 등록·수정·취소, 생산완료 실적 입력, 원재료 차감 생산확정을 준비합니다. 실제 DB는 변경하지 않습니다. 반드시 preview_text와 warnings를 사용자에게 먼저 보여주고 새로운 사용자 메시지의 명시적 승인 이후에만 execute_production_operation을 호출합니다. 모든 수량 입력은 kg입니다.',
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
                    enum: ['CREATE_WORK_ORDER', 'UPDATE_WORK_ORDER', 'CANCEL_WORK_ORDER', 'COMPLETE_PRODUCTION', 'CONFIRM_PRODUCTION'],
                    description: '작업지시 등록/수정/취소, 생산완료 입력, 원재료 차감 생산확정',
                  },
                  record_id: {
                    type: 'string',
                    format: 'uuid',
                    description: 'CREATE_WORK_ORDER 외 action에서 대상 production_record ID',
                  },
                  work_date: {
                    type: 'string',
                    format: 'date',
                    description: 'CREATE_WORK_ORDER에서 필수. UPDATE_WORK_ORDER에서 변경 시 전달.',
                  },
                  product_id: {
                    type: 'string',
                    description: 'CREATE_WORK_ORDER에서 필수. 실제 제품 ID를 search_products_and_recipes로 확인.',
                  },
                  planned_quantity_kg: {
                    type: 'number',
                    exclusiveMinimum: 0,
                    description: '작업지시 계획생산량 kg. 서버에서 한 번만 ×1000하여 g로 저장.',
                  },
                  lot_number: {
                    type: 'string',
                    description: '선택. 생략 시 작업일 기준 LOTYYYYMMDD-N 규칙으로 자동 생성.',
                  },
                  note: { type: 'string', description: '작업지시 비고' },
                  worker_name: { type: 'string', description: '작업자명' },
                  actual_quantity_kg: {
                    type: 'number',
                    minimum: 0,
                    description: 'COMPLETE_PRODUCTION 실제 완료량 kg',
                  },
                  defect_quantity_kg: {
                    type: 'number',
                    minimum: 0,
                    description: 'COMPLETE_PRODUCTION 불량량 kg. 생략 시 0.',
                  },
                  sample_quantity_kg: {
                    type: 'number',
                    minimum: 0,
                    description: 'COMPLETE_PRODUCTION 샘플량 kg. 생략 시 0.',
                  },
                  inspection_result: { type: 'string', description: '검사결과. 생략 시 기존값 또는 적합.' },
                  inspection_note: { type: 'string', description: '검사 비고' },
                  sanitation_check: { type: 'boolean', description: '위생 확인 여부' },
                  reason: { type: 'string', description: '변경/실행 이유' },
                },
                required: ['action'],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '200': { description: '생산 업무 실행 미리보기 생성 성공. DB 미변경.', content: { 'application/json': { schema: standardSuccessSchema() } } },
          '401': { description: 'MONI GPT Action 인증 실패' },
          '400': { description: '입력·상태·단위·재고·원재료 매핑 검증 또는 승인 건 생성 실패' },
        },
      },
    },
    '/chatgpt-actions/write/production/execute': {
      post: {
        operationId: 'execute_production_operation',
        summary: '승인된 생산 작업지시·완료·확정 실행',
        description: 'prepare_production_operation 이후 새로운 사용자 메시지에서 명시적으로 승인한 경우에만 실제 실행합니다. 작업지시 취소는 물리 삭제하지 않고 cancelled로 보존합니다. CONFIRM_PRODUCTION은 원재료 매핑·재고를 다시 검증하고 재고 차감과 OUTBOUND 원장을 생성합니다.',
        security: [{ moniActionKey: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: executeSchema() } } },
        responses: {
          '200': { description: '생산 업무 실행, 감사로그 기록 및 DB 재검증 성공', content: { 'application/json': { schema: standardSuccessSchema() } } },
          '401': { description: 'MONI GPT Action 인증 실패' },
          '400': { description: '승인 만료, 중복 실행, 상태 변경, 재고/매핑 검증 또는 실행 실패' },
        },
      },
    },
  }

  return NextResponse.json({
    openapi: '3.1.0',
    info: {
      title: 'MONI Business Operations Actions',
      version: '1.2.0',
      description: 'ChatGPT 제품 자체가 지능·대화·판단을 담당하고 MONI는 두배 실제 데이터를 조회하며, 사용자 승인 후 월간 생산계획과 생산 작업지시·실적·원재료 차감 확정을 실행하는 GPT Actions API입니다. MONI 서버 자체에서는 별도 AI 모델 추론을 하지 않습니다.',
    },
    servers: [{ url: CHATGPT_ACTION_PUBLIC_ORIGIN }],
    paths: { ...readPaths, ...writePaths },
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
