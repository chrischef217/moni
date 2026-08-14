import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const backend = readFileSync('src/lib/moni/agent/tool-backend.ts', 'utf8')
const registry = readFileSync('src/lib/moni/agent/tools/registry.ts', 'utf8')
const mcp = readFileSync('src/lib/moni/mcp/tools.ts', 'utf8')
const catalog = readFileSync('src/lib/moni/agent/tools/catalog.ts', 'utf8')
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

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else if (/\.(?:ts|tsx|js|mjs)$/.test(name)) out.push(full)
  }
  return out
}

function normalized(file) {
  return relative(process.cwd(), file).split(sep).join('/')
}

test('production SDK registry executes read-only DB tools through extracted backend', () => {
  assert.match(registry, /executeMoniReadOnlyTool/)
  assert.doesNotMatch(registry, /executeMoniAgentTool/)
  assert.doesNotMatch(registry, /from ['"]@\/lib\/moni\/agent-v2['"]/)
})

test('MCP uses the canonical Agent catalog and extracted backend, not legacy agent-v2', () => {
  assert.match(mcp, /executeMoniReadOnlyTool/)
  assert.match(mcp, /moniToolDefinitions/)
  assert.match(mcp, /z\.toJSONSchema/)
  assert.doesNotMatch(mcp, /executeMoniAgentTool/)
  assert.doesNotMatch(mcp, /MONI_AGENT_TOOLS/)
  assert.doesNotMatch(mcp, /from ['"]@\/lib\/moni\/agent-v2['"]/)
  assert.match(catalog, /productionToolDefinitions/)
  assert.match(catalog, /inventoryToolDefinitions/)
  assert.match(catalog, /commercialToolDefinitions/)
  assert.match(catalog, /systemToolDefinitions/)
})

test('no production source has a runtime import from legacy agent-v2', () => {
  const violations = []
  for (const file of walk('src')) {
    if (normalized(file) === 'src/lib/moni/agent-v2.ts') continue
    const source = readFileSync(file, 'utf8')
    for (const line of source.split(/\r?\n/)) {
      if (!line.includes("@/lib/moni/agent-v2")) continue
      if (/^\s*import\s+type\b/.test(line)) continue
      violations.push(`${normalized(file)}: ${line.trim()}`)
    }
  }
  assert.deepEqual(violations, [])
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

test('canonical tenant boundary and critical business semantics are preserved in extracted backend', () => {
  assert.doesNotMatch(backend, /\[context\.businessId, 'default'\]/)
  assert.doesNotMatch(backend, /\.in\('business_id',[^\n]*default/)
  assert.match(backend, /\.eq\('business_id', context\.businessId\)/)
  assert.match(backend, /unit_price_per_kg 컬럼명은 레거시이며 운영상 기준 포장 1EA 가격입니다/)
  assert.match(backend, /unaccounted_gap_g는 확정 로스가 아니라/)
  assert.match(backend, /supplier_statement_balances는 거래처 명세서 잔액이며 실제 입고·매입 행으로 간주하지 않습니다/)
})

test('legacy agent-v2 is a type-only compatibility shim with no runtime resurrection path', () => {
  assert.match(legacy, /Legacy import-compatibility shim/)
  assert.match(legacy, /export type \{/)
  assert.doesNotMatch(legacy, /executeMoniAgentTool/)
  assert.doesNotMatch(legacy, /runMoniAgent/)
  assert.doesNotMatch(legacy, /MONI_AGENT_TOOLS/)
  assert.doesNotMatch(legacy, /\.from\(/)
  assert.doesNotMatch(legacy, /api\.openai\.com/)
  assert.doesNotMatch(legacy, /createMoniServiceRoleClient/)
})
