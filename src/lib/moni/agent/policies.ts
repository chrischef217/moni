export const MONI_TOOL_NAMES = [
  'get_business_clock',
  'get_company_context',
  'search_production_records',
  'search_production_plans',
  'get_raw_material_inventory',
  'search_raw_material_transactions',
  'search_sales_and_receivables',
  'search_purchases_and_payables',
  'search_products_and_recipes',
  'get_agent_capabilities',
  'report_pmo_event',
] as const

export type MoniToolName = typeof MONI_TOOL_NAMES[number]

const ADMIN_TOOLS = new Set<MoniToolName>(MONI_TOOL_NAMES)
const FREELANCER_TOOLS = new Set<MoniToolName>([
  'get_business_clock',
  'search_production_records',
  'search_production_plans',
  'get_raw_material_inventory',
  'search_raw_material_transactions',
  'search_products_and_recipes',
  'get_agent_capabilities',
  'report_pmo_event',
])
const UNKNOWN_ROLE_TOOLS = new Set<MoniToolName>([
  'get_business_clock',
  'get_agent_capabilities',
  'report_pmo_event',
])

export function normalizeMoniRole(role: unknown) {
  return String(role ?? '').trim().toLowerCase()
}

export function allowedToolNamesForRole(role: unknown): MoniToolName[] {
  const normalized = normalizeMoniRole(role)
  const allowed = normalized === 'admin'
    ? ADMIN_TOOLS
    : normalized === 'freelancer'
      ? FREELANCER_TOOLS
      : UNKNOWN_ROLE_TOOLS
  return MONI_TOOL_NAMES.filter((name) => allowed.has(name))
}

export function isToolAllowedForRole(role: unknown, toolName: MoniToolName) {
  return allowedToolNamesForRole(role).includes(toolName)
}

export function assertToolAllowedForRole(role: unknown, toolName: MoniToolName) {
  if (!isToolAllowedForRole(role, toolName)) {
    throw new Error(`현재 사용자 권한으로 ${toolName} 도구를 사용할 수 없습니다.`)
  }
}

export function rolePolicySummary(role: unknown) {
  const normalized = normalizeMoniRole(role)
  if (normalized === 'admin') {
    return '관리자: 생산·재고·판매·수금·매입·지급·회사 문맥 조회와 PMO 접수가 허용됩니다.'
  }
  if (normalized === 'freelancer') {
    return '프리랜서: 생산·재고·제품 조회와 오류 접수만 허용됩니다. 판매·수금·매입·지급·회사 PMO 문맥은 조회할 수 없습니다.'
  }
  return '미정 역할: 현재시간·지원범위 확인과 오류 접수만 허용됩니다.'
}
