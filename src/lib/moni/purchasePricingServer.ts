import { createMoniServiceRoleClient } from '@/lib/moni/db'
import {
  derivePackagingPurchasePricing,
  deriveRawPurchasePricing,
  type MasterPurchasePricing,
  type PurchasePricingUnit,
} from '@/lib/moni/purchasePricing'

type MoniClient = ReturnType<typeof createMoniServiceRoleClient>
type PurchaseCategory = 'RAW_MATERIAL' | 'PACKAGING'

export type ResolvedMasterPurchasePricing = MasterPurchasePricing & {
  itemName: string
  masterPrice: number
  packingWeightG: number | null
}

const text = (value: unknown) => String(value ?? '').trim()
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function scopedBusiness(value: unknown, businessId: string) {
  const current = text(value)
  return current === businessId || current === 'default' || current === ''
}

async function findRawMaterial(client: MoniClient, materialId: string) {
  const byId = await client.from('raw_materials').select('*').eq('id', materialId).maybeSingle()
  if (byId.error) throw new Error(byId.error.message)
  if (byId.data) return byId.data
  const byCode = await client.from('raw_materials').select('*').eq('item_code', materialId).maybeSingle()
  if (byCode.error) throw new Error(byCode.error.message)
  return byCode.data
}

async function findPackagingMaterial(client: MoniClient, materialId: string) {
  const byId = await client.from('packaging_materials').select('*').eq('id', materialId).maybeSingle()
  if (byId.error) throw new Error(byId.error.message)
  if (byId.data) return byId.data
  const byCode = await client.from('packaging_materials').select('*').eq('material_code', materialId).maybeSingle()
  if (byCode.error) throw new Error(byCode.error.message)
  return byCode.data
}

export async function resolveMasterPurchasePricing(
  client: MoniClient,
  input: {
    businessId: string
    category: PurchaseCategory
    materialId: string
    quantity: number
    unit: PurchasePricingUnit
  },
): Promise<ResolvedMasterPurchasePricing> {
  if (input.category === 'RAW_MATERIAL') {
    const material = await findRawMaterial(client, input.materialId)
    if (!material || material.is_active === false || !scopedBusiness(material.business_id, input.businessId)) {
      throw new Error('선택한 원재료를 찾을 수 없습니다.')
    }
    if (text(material.ingredient_type) === '반제품' || text(material.semifinished_usage_type) === 'inline') {
      throw new Error('인라인 자체생산 반제품은 매입·입고로 등록할 수 없습니다.')
    }
    const packingWeightG = numberValue(material.packing_weight_g)
    const packagePrice = numberValue(material.unit_price_per_kg)
    return {
      ...deriveRawPurchasePricing({ quantity: input.quantity, unit: input.unit, packingWeightG, packagePrice }),
      itemName: text(material.item_name),
      masterPrice: packagePrice,
      packingWeightG,
    }
  }

  const material = await findPackagingMaterial(client, input.materialId)
  if (!material || material.is_active === false || !scopedBusiness(material.business_id, input.businessId)) {
    throw new Error('선택한 부재료를 찾을 수 없습니다.')
  }
  const masterPrice = numberValue(material.unit_price)
  return {
    ...derivePackagingPurchasePricing({ quantity: input.quantity, unitPrice: masterPrice }),
    itemName: text(material.material_name),
    masterPrice,
    packingWeightG: null,
  }
}
