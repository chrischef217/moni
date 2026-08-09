import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const backend = readFileSync('src/lib/moni/agent/tool-backend.ts', 'utf8')
const registry = readFileSync('src/lib/moni/agent/tools/registry.ts', 'utf8')
const mcp = readFileSync('src/lib/moni/mcp/tools.ts', 'utf8')
const legacy = readFileSync('src/lib/moni/agent-v2.ts', 'utf8')

const READ_ONLY_TOOLS = [
  'get_business_clock',
  'get_company_context',
  'search_production_records',
  'search_production_plans',
  'get_raw_material_inventory',
  'search_raw_material_transactions',
  'search_sales_and_receivables',
  'search_purchases_and_payables',
  'search_products_and_recipes',
]

test('production SDK registry executes read-only DB tools through extracted backend', () => {
  assert.match(registry, /executeMoniReadOnlyTool/)
  assert.doesNotMatch(registry, /executeMoniAgentTool/)
  assert.doesNotMatch(registry, /from ['"]@\/lib\/moni\/agent-v2['"]/)
})

test('MCP executes read-only DB tools through the same extracted backend', () => {
  assert.match(mcp, /executeMoniReadOnlyTool/)
  assert.doesNotMatch(mcp, /executeMoniAgentTool/)
  assert.match(mcp, /MONI_AGENT_TOOLS/)
})

test('extracted backend owns every production read-only tool implementation', () => {
  for (const name of READ_ONLY_TOOLS) {
    assert.match(backend, new RegExp(`case ['"]${name}['"]`))
  }
  for (const table of [
    'moni_ai_project_context',
    'production_records',
    'monthly_production_plans',
    'raw_materials',
    'raw_material_transactions',
    'sales_clients',
    'sales_orders',
    'sales_receipts',
    'sales_order_items',
    'purchases',
    'purchase_payments',
    'purchase_supplier_statement_balances',
    'products',
    'recipes',
    'raw_material_mapping',
  ]) {
    assert.match(backend, new RegExp(`\\.from\\(['"]${table}['"]\\)`))
  }
})

test('legacy tenant alias and critical business semantics are preserved in extracted backend', () => {
  assert.match(backend, /\[context\.businessId, 'default'\]/)
  assert.match(backend, /unit_price_per_kg 컬럼명은 레거시이며 운영상 기준 포장 1EA 가격입니다/)
  assert.match(backend, /unaccounted_gap_g는 확정 로스가 아니라/)
  assert.match(backend, /supplier_statement_balances는 거래처 명세서 잔액이며 실제 입고·매입 행으로 간주하지 않습니다/)
})

test('legacy agent-v2 remains compatibility-only during phased extraction', () => {
  assert.match(legacy, /export async function executeMoniAgentTool/)
  assert.match(legacy, /export async function runMoniAgent/)
  assert.doesNotMatch(registry, /runMoniAgent/)
  assert.doesNotMatch(mcp, /runMoniAgent/)
})
