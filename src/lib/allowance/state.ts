import {
  DEFAULT_ALLOWANCE_STATE,
  type AllowanceState,
  type FreelancerType,
  type Product,
} from '@/types/allowance'

function sortProducts(products: Product[]) {
  return [...products].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return a.id - b.id
  })
}

export function normalizeProductOrders(products: Product[]) {
  const grouped = new Map<number, Product[]>()

  products.forEach((product) => {
    const rows = grouped.get(product.client_id) ?? []
    rows.push(product)
    grouped.set(product.client_id, rows)
  })

  const normalized: Product[] = []
  grouped.forEach((group) => {
    sortProducts(group).forEach((product, index) => {
      normalized.push({ ...product, sort_order: index + 1 })
    })
  })

  return normalized
}

function toFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export function normalizeAllowanceState(raw: Partial<AllowanceState> | null | undefined): AllowanceState {
  const base = DEFAULT_ALLOWANCE_STATE
  const safe = raw ?? {}

  const freelancers = Array.isArray(safe.freelancers)
    ? safe.freelancers.map((item, idx) => ({
        id: toFiniteNumber(item.id, idx + 1),
        name: String(item.name ?? ''),
        rrn: String(item.rrn ?? ''),
        type: (item.type === 'production' ? 'production' : 'sales') as FreelancerType,
        login_id: String(item.login_id ?? ''),
        password: String(item.password ?? ''),
        address: String(item.address ?? ''),
        phone: String(item.phone ?? ''),
        bank_name: String(item.bank_name ?? ''),
        account_number: String(item.account_number ?? ''),
      }))
    : []

  const clients = Array.isArray(safe.clients)
    ? safe.clients.map((item, idx) => ({
        id: toFiniteNumber(item.id, idx + 1),
        name: String(item.name ?? ''),
        address: String(item.address ?? ''),
        phone: String(item.phone ?? ''),
        memo: String(item.memo ?? ''),
      }))
    : []

  const productsRaw = Array.isArray(safe.products)
    ? safe.products.map((item, idx) => ({
        id: toFiniteNumber(item.id, idx + 1),
        client_id: toFiniteNumber(item.client_id, 0),
        name: String(item.name ?? ''),
        price_per_kg: toFiniteNumber(item.price_per_kg, 0),
        freelancer_id: toFiniteNumber(item.freelancer_id, 0),
        sort_order: toFiniteNumber((item as Product).sort_order, idx + 1),
      }))
    : []

  const payRecords = Array.isArray(safe.payRecords)
    ? safe.payRecords.map((item, idx) => ({
        id: toFiniteNumber(item.id, idx + 1),
        freelancer_id: toFiniteNumber(item.freelancer_id, 0),
        year: toFiniteNumber(item.year, new Date().getFullYear()),
        month: toFiniteNumber(item.month, 1),
        total_amount: toFiniteNumber(item.total_amount, 0),
        withholding_tax: toFiniteNumber(item.withholding_tax, 0),
        net_amount: toFiniteNumber(item.net_amount, 0),
        details: Array.isArray(item.details)
          ? item.details.map((detail, dIdx) => ({
              id: toFiniteNumber(detail.id, dIdx + 1),
              product_id: toFiniteNumber(detail.product_id, 0),
              quantity_kg: toFiniteNumber(detail.quantity_kg, 0),
              amount: toFiniteNumber(detail.amount, 0),
            }))
          : [],
      }))
    : []

  return {
    company: {
      company_name: String(safe.company?.company_name ?? base.company.company_name),
      representative: String(safe.company?.representative ?? base.company.representative),
      business_reg_number: String(safe.company?.business_reg_number ?? base.company.business_reg_number),
      business_type: String(safe.company?.business_type ?? base.company.business_type),
      business_sector: String(safe.company?.business_sector ?? base.company.business_sector),
      address: String(safe.company?.address ?? base.company.address),
      phone: String(safe.company?.phone ?? base.company.phone),
    },
    payment_day: Math.min(31, Math.max(1, toFiniteNumber(safe.payment_day, base.payment_day))),
    admin_account: {
      login_id: String(safe.admin_account?.login_id ?? base.admin_account.login_id),
      password: String(safe.admin_account?.password ?? base.admin_account.password),
    },
    freelancers,
    clients,
    products: normalizeProductOrders(productsRaw),
    payRecords,
  }
}
