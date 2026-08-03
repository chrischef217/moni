export type PurchasePricingUnit = 'KG' | 'G' | 'EA'

export type MasterPurchasePricing = {
  inventoryQuantityBase: number
  inventoryUnit: 'G' | 'EA'
  unitPrice: number
  supplyAmount: number
}

function finite(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function deriveRawPurchasePricing(input: {
  quantity: number
  unit: PurchasePricingUnit
  packingWeightG: number
  packagePrice: number
}): MasterPurchasePricing {
  const quantity = finite(input.quantity)
  const packingWeightG = finite(input.packingWeightG)
  const packagePrice = finite(input.packagePrice)

  if (quantity < 0) throw new Error('입고수량은 0 이상이어야 합니다.')
  if (packingWeightG <= 0) throw new Error('원재료 관리에서 기준 포장중량(g)을 먼저 등록해 주세요.')
  if (packagePrice <= 0) throw new Error('원재료 관리에서 개당 매입단가를 먼저 등록해 주세요.')
  if (input.unit === 'EA' && !Number.isInteger(quantity)) throw new Error('EA 입고수량은 정수로 입력해 주세요.')

  const inventoryQuantityBase = input.unit === 'EA'
    ? quantity * packingWeightG
    : input.unit === 'KG'
      ? quantity * 1000
      : quantity

  if (Math.abs(inventoryQuantityBase - Math.round(inventoryQuantityBase)) > 0.000001) {
    throw new Error('입고량은 g 환산 후 정수가 되도록 입력해 주세요.')
  }

  const unitPrice = input.unit === 'EA'
    ? packagePrice
    : input.unit === 'KG'
      ? packagePrice * 1000 / packingWeightG
      : packagePrice / packingWeightG

  return {
    inventoryQuantityBase: Math.round(inventoryQuantityBase),
    inventoryUnit: 'G',
    unitPrice: roundMoney(unitPrice),
    supplyAmount: roundMoney((inventoryQuantityBase / packingWeightG) * packagePrice),
  }
}

export function derivePackagingPurchasePricing(input: {
  quantity: number
  unitPrice: number
}): MasterPurchasePricing {
  const quantity = finite(input.quantity)
  const unitPrice = finite(input.unitPrice)
  if (quantity < 0 || !Number.isInteger(quantity)) throw new Error('부재료 입고수량은 정수 EA로 입력해 주세요.')
  if (unitPrice <= 0) throw new Error('부재료 관리에서 EA 단가를 먼저 등록해 주세요.')
  return {
    inventoryQuantityBase: quantity,
    inventoryUnit: 'EA',
    unitPrice: roundMoney(unitPrice),
    supplyAmount: roundMoney(quantity * unitPrice),
  }
}
