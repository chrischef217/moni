import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_DEPTH = 8
const PAGE_SIZE = 500
const MAX_SELECTED_RECORDS = 100

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizeKey(value: unknown): string {
  return text(value).toLocaleLowerCase('ko-KR').replace(/\s+/g, '')
}

function isSemiIngredient(value: unknown): boolean {
  return ['반제품', 'semi', 'semiproduct'].includes(normalizeKey(value))
}

function isCompletedStatus(value: unknown): boolean {
  const key = normalizeKey(value)
  return ['completed', 'confirmed', '완료', '확정'].includes(key)
}

async function fetchAll<T>(makeQuery: () => any, label: string): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (let page = 0; page < 50; page += 1) {
    const result = await makeQuery().range(from, from + PAGE_SIZE - 1)
    if (result.error) throw new Error(`${label}: ${result.error.message}`)
    const pageRows = (result.data ?? []) as T[]
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) return rows
    from += PAGE_SIZE
  }
  throw new Error(`${label}: 조회 행 수가 안전 한도를 초과했습니다.`)
}

type RecipeRow = {
  id?: string | null
  product_id?: string | null
  product_name?: string | null
  ratio_percent?: number | string | null
  ingredient_type?: string | null
  semi_product_id?: string | null
  sort_order?: number | string | null
}

type ProductRow = {
  id?: string | null
  product_name?: string | null
}

type SemiStage = {
  key: string
  product_id: string
  product_name: string
  parent_product_id: string
  parent_product_name: string
  depth: number
  ratio_from_parent: number
  required_g: number
  path: string[]
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createMoniServiceRoleClient()
    const from = text(request.nextUrl.searchParams.get('from'))
    const to = text(request.nextUrl.searchParams.get('to'))
    const product = text(request.nextUrl.searchParams.get('product'))
    const selectedIds = Array.from(new Set(
      text(request.nextUrl.searchParams.get('ids'))
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    )).slice(0, MAX_SELECTED_RECORDS)

    let recordQuery = supabase
      .from('production_records')
      .select('*')
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000)

    if (selectedIds.length > 0) {
      recordQuery = recordQuery.in('id', selectedIds)
    } else {
      if (from) recordQuery = recordQuery.gte('work_date', from)
      if (to) recordQuery = recordQuery.lte('work_date', to)
      if (product) recordQuery = recordQuery.eq('product_id', product)
    }

    const [recordResult, recipes, products] = await Promise.all([
      recordQuery,
      fetchAll<RecipeRow>(
        () => supabase
          .from('recipes')
          .select('id, product_id, product_name, ratio_percent, ingredient_type, semi_product_id, sort_order')
          .eq('is_active', true)
          .order('product_id', { ascending: true })
          .order('sort_order', { ascending: true }),
        '레시피 조회 실패',
      ),
      fetchAll<ProductRow>(
        () => supabase
          .from('products')
          .select('id, product_name')
          .order('product_name', { ascending: true }),
        '제품 조회 실패',
      ),
    ])

    if (recordResult.error) throw new Error(recordResult.error.message)

    const recipesByProduct = new Map<string, RecipeRow[]>()
    for (const recipe of recipes) {
      const productId = text(recipe.product_id)
      if (!productId) continue
      recipesByProduct.set(productId, [...(recipesByProduct.get(productId) ?? []), recipe])
    }
    const productsById = new Map<string, string>()
    for (const item of products) {
      const id = text(item.id)
      if (id) productsById.set(id, text(item.product_name) || id)
    }

    const buildSemiStages = (rootProductId: string, rootProductName: string, quantityG: number) => {
      const stages: SemiStage[] = []
      const issues: string[] = []

      const expand = (
        currentProductId: string,
        currentProductName: string,
        currentQuantityG: number,
        depth: number,
        pathIds: string[],
        pathNames: string[],
      ) => {
        const rows = recipesByProduct.get(currentProductId) ?? []
        for (const recipe of rows) {
          if (!isSemiIngredient(recipe.ingredient_type)) continue
          const ratio = numberValue(recipe.ratio_percent)
          if (!(ratio > 0)) continue
          const semiProductId = text(recipe.semi_product_id)
          if (!semiProductId) {
            issues.push(`${currentProductName}: 연결 반제품 미설정`)
            continue
          }
          const semiProductName = productsById.get(semiProductId) || semiProductId
          if (pathIds.includes(semiProductId)) {
            issues.push(`${[...pathNames, semiProductName].join(' → ')}: 순환 연결`)
            continue
          }
          if (depth + 1 > MAX_DEPTH) {
            issues.push(`${semiProductName}: 최대 ${MAX_DEPTH}단계 초과`)
            continue
          }
          const requiredG = (currentQuantityG * ratio) / 100
          const nextPathNames = [...pathNames, semiProductName]
          stages.push({
            key: `${[...pathIds, semiProductId].join('>')}::${text(recipe.id)}`,
            product_id: semiProductId,
            product_name: semiProductName,
            parent_product_id: currentProductId,
            parent_product_name: currentProductName,
            depth: depth + 1,
            ratio_from_parent: ratio,
            required_g: requiredG,
            path: nextPathNames,
          })
          expand(
            semiProductId,
            semiProductName,
            requiredG,
            depth + 1,
            [...pathIds, semiProductId],
            nextPathNames,
          )
        }
      }

      expand(rootProductId, rootProductName, quantityG, 0, [rootProductId], [rootProductName])
      return { stages, issues: Array.from(new Set(issues)) }
    }

    const records = ((recordResult.data ?? []) as Array<Record<string, unknown>>)
      .filter((record) => isCompletedStatus(record.status))
      .map((record) => {
        const productId = text(record.product_id)
        const productName = text(record.product_name) || productsById.get(productId) || productId
        const plannedG = numberValue(record.planned_quantity_g)
        const actualG = numberValue(record.actual_quantity_g)
        const defectG = numberValue(record.defect_quantity_g)
        const sampleG = numberValue(record.sample_quantity_g)
        const quantityBasisG = plannedG > 0 ? plannedG : actualG + defectG + sampleG
        const semi = productId && quantityBasisG > 0
          ? buildSemiStages(productId, productName, quantityBasisG)
          : { stages: [] as SemiStage[], issues: ['생산량 또는 제품 연결 없음'] }

        return {
          id: record.id,
          lot_number: record.lot_number,
          work_date: record.work_date,
          product_id: record.product_id,
          product_name: productName,
          planned_quantity_g: plannedG,
          actual_quantity_g: actualG,
          defect_quantity_g: defectG,
          sample_quantity_g: sampleG,
          status: record.status,
          business_id: record.business_id,
          semi_products: semi.stages,
          semi_product_issues: semi.issues,
        }
      })

    if (selectedIds.length > 0) {
      const selectedOrder = new Map(selectedIds.map((id, index) => [id, index]))
      records.sort((a, b) => (selectedOrder.get(text(a.id)) ?? 9999) - (selectedOrder.get(text(b.id)) ?? 9999))
    }

    return NextResponse.json({
      ok: true,
      records,
      products: products.map((item) => ({ id: text(item.id), product_name: text(item.product_name) })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '생산일보 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
