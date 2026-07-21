import { NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 400
const DEFAULT_BUSINESS_ID = '20220523011'
const MAX_RECIPE_DEPTH = 8
const RATIO_TOLERANCE = 0.5

const text = (value) => String(value ?? '').trim()
const num = (value) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const normalizeKey = (value) => text(value).toLocaleLowerCase('ko-KR').replace(/\s+/g, '')
const median = (values) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000)

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('조회 월 형식이 올바르지 않습니다.')
  const start = `${month}-01`
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { start, end: new Date(next.getTime() - 86400000).toISOString().slice(0, 10) }
}

function businessPriority(value, businessId) {
  const raw = text(value)
  if (raw === businessId) return 0
  if (raw === DEFAULT_BUSINESS_ID) return 1
  if (raw === 'default') return 2
  if (!raw) return 3
  return 4
}

async function fetchAll(makeQuery, label) {
  const rows = []
  let from = 0
  for (let page = 0; page < 50; page += 1) {
    const result = await makeQuery().range(from, from + PAGE_SIZE - 1)
    if (result.error) throw new Error(`${label}: ${result.error.message}`)
    const pageRows = result.data || []
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) return rows
    from += PAGE_SIZE
  }
  throw new Error(`${label}: 조회 행 수가 안전 한도를 초과했습니다.`)
}

function config(level) {
  if (level === 'stable') return { minimumRuns: 6, maximumGapCv: 0.45, duplicateWindow: 14, label: '안정형' }
  if (level === 'expanded') return { minimumRuns: 3, maximumGapCv: 1.2, duplicateWindow: 7, label: '확장형' }
  return { minimumRuns: 4, maximumGapCv: 0.8, duplicateWindow: 10, label: '표준형' }
}

function buildForecasts(records, plans, month, level) {
  const { start, end } = monthRange(month)
  const rule = config(level)
  const grouped = new Map()

  records.forEach((record) => {
    const productId = text(record.product_id) || `name:${text(record.product_name)}`
    if (!productId || !text(record.work_date)) return
    grouped.set(productId, [...(grouped.get(productId) || []), record])
  })

  const forecasts = []
  Array.from(grouped.entries()).forEach(([productId, rows]) => {
    const ordered = [...rows].sort((a, b) => text(a.work_date).localeCompare(text(b.work_date)))
    if (ordered.length < rule.minimumRuns) return

    const gaps = ordered
      .slice(1)
      .map((row, index) => dayDiff(text(ordered[index].work_date), text(row.work_date)))
      .filter((gap) => gap > 0)
    if (gaps.length < rule.minimumRuns - 1) return

    const average = gaps.reduce((sum, value) => sum + value, 0) / gaps.length
    const deviation = Math.sqrt(gaps.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / gaps.length)
    const coefficient = average > 0 ? deviation / average : 99
    if (coefficient > rule.maximumGapCv) return

    const gapDays = Math.max(1, Math.round(median(gaps)))
    const quantities = ordered.map((row) => num(row.actual_quantity_g || row.planned_quantity_g)).filter((value) => value > 0)
    if (!quantities.length) return

    const quantity = Math.round(median(quantities))
    let expectedDate = addDays(text(ordered.at(-1).work_date), gapDays)
    while (expectedDate < start) expectedDate = addDays(expectedDate, gapDays)

    while (expectedDate <= end) {
      const duplicated = plans.some((plan) => {
        const planProductId = text(plan.product_id) || `name:${text(plan.product_name)}`
        return planProductId === productId && Math.abs(dayDiff(expectedDate, text(plan.plan_date))) <= rule.duplicateWindow
      })

      if (!duplicated) {
        forecasts.push({
          id: `ai-${productId}-${expectedDate}`,
          source: 'ai',
          forecast_level: level,
          forecast_level_label: rule.label,
          plan_date: expectedDate,
          product_id: productId.startsWith('name:') ? '' : productId,
          product_name: text(ordered.at(-1).product_name),
          planned_quantity_g: quantity,
          history_count: ordered.length,
          median_gap_days: gapDays,
          confidence: coefficient <= 0.45 ? '높음' : coefficient <= 0.8 ? '보통' : '낮음',
        })
      }
      expectedDate = addDays(expectedDate, gapDays)
    }
  })

  return forecasts.sort((a, b) => text(a.plan_date).localeCompare(text(b.plan_date)))
}

function isPlaceholderName(value) {
  const key = normalizeKey(value)
  if (!key) return true
  return (
    key === '미연결' ||
    key === '미연결제품' ||
    key === '연결필요' ||
    key === '원재료연결필요' ||
    key === '확인필요' ||
    key.startsWith('미연결:') ||
    key.includes('미연결제품')
  )
}

function isSemiIngredient(value) {
  return ['반제품', 'semi', 'semiproduct'].includes(normalizeKey(value))
}

function isRawIngredient(value) {
  const key = normalizeKey(value)
  if (!key) return true
  return ['원재료', 'raw', '제품/반제품', '제품반제품', 'productsemi', 'hybridsemi'].includes(key)
}

function createRecipeEngine({ recipes, mappings, materials, products, businessId }) {
  const productById = new Map()
  products.forEach((product) => {
    const id = text(product.id)
    if (id) productById.set(id, product)
  })

  const recipesByProduct = new Map()
  recipes.forEach((recipe) => {
    const productId = text(recipe.product_id)
    if (!productId) return
    recipesByProduct.set(productId, [...(recipesByProduct.get(productId) || []), recipe])
  })
  recipesByProduct.forEach((rows, key) => {
    recipesByProduct.set(key, [...rows].sort((a, b) => num(a.sort_order) - num(b.sort_order) || text(a.id).localeCompare(text(b.id))))
  })

  const activeMaterials = materials.filter((material) => material.is_active !== false && !isPlaceholderName(material.item_name))
  const materialById = new Map()
  const materialsByName = new Map()
  activeMaterials.forEach((material) => {
    const id = text(material.id)
    if (id) materialById.set(id, material)
    const nameKey = normalizeKey(material.item_name)
    if (!nameKey) return
    materialsByName.set(nameKey, [...(materialsByName.get(nameKey) || []), material])
  })
  materialsByName.forEach((rows, key) => {
    materialsByName.set(key, [...rows].sort((a, b) => businessPriority(a.business_id, businessId) - businessPriority(b.business_id, businessId)))
  })

  const sortMappings = (rows) => [...rows].sort((a, b) => {
    const businessOrder = businessPriority(a.business_id, businessId) - businessPriority(b.business_id, businessId)
    if (businessOrder !== 0) return businessOrder
    const defaultOrder = Number(b.is_default === true) - Number(a.is_default === true)
    if (defaultOrder !== 0) return defaultOrder
    return new Date(text(b.created_at) || 0).getTime() - new Date(text(a.created_at) || 0).getTime()
  })

  const recipeScoped = new Map()
  const productScoped = new Map()
  const globalScoped = new Map()

  mappings.forEach((mapping) => {
    if (mapping.is_default !== true) return
    const scope = text(mapping.mapping_scope).toLowerCase() || 'global'
    const recipeId = text(mapping.recipe_id)
    const mappingProductId = text(mapping.product_id)
    const foodTypeId = text(mapping.food_type_id)

    if (scope === 'recipe' && recipeId) {
      recipeScoped.set(recipeId, [...(recipeScoped.get(recipeId) || []), mapping])
    } else if (scope === 'product' && mappingProductId && foodTypeId) {
      const key = `${mappingProductId}::${foodTypeId}`
      productScoped.set(key, [...(productScoped.get(key) || []), mapping])
    } else if (foodTypeId) {
      globalScoped.set(foodTypeId, [...(globalScoped.get(foodTypeId) || []), mapping])
    }
  })

  recipeScoped.forEach((rows, key) => recipeScoped.set(key, sortMappings(rows)))
  productScoped.forEach((rows, key) => productScoped.set(key, sortMappings(rows)))
  globalScoped.forEach((rows, key) => globalScoped.set(key, sortMappings(rows)))

  function preferredMapping(recipe) {
    const recipeId = text(recipe.id)
    const productId = text(recipe.product_id)
    const foodTypeId = text(recipe.food_type_id)
    return (
      (recipeId ? recipeScoped.get(recipeId)?.[0] : null) ||
      (productId && foodTypeId ? productScoped.get(`${productId}::${foodTypeId}`)?.[0] : null) ||
      (foodTypeId ? globalScoped.get(foodTypeId)?.[0] : null) ||
      null
    )
  }

  function resolveMaterial(recipe) {
    const mapping = preferredMapping(recipe)
    const mappedId = text(mapping?.raw_material_ref_id || mapping?.raw_material_id)
    const mappedName = isPlaceholderName(mapping?.raw_material_name) ? '' : text(mapping?.raw_material_name)
    const recipeName = text(recipe.food_type_name)

    const byId = mappedId ? materialById.get(mappedId) : null
    const byMappedName = mappedName ? materialsByName.get(normalizeKey(mappedName))?.[0] : null
    const byRecipeName = recipeName ? materialsByName.get(normalizeKey(recipeName))?.[0] : null
    return byId || byMappedName || byRecipeName || null
  }

  const formulaCache = new Map()

  function expandFormula(productId, productName) {
    const cacheKey = text(productId)
    if (formulaCache.has(cacheKey)) return formulaCache.get(cacheKey)

    const materialFractions = new Map()
    const issues = []
    const issueKeys = new Set()
    const audit = {
      product_id: cacheKey,
      product_name: text(productById.get(cacheKey)?.product_name) || text(productName) || cacheKey,
      recipe_count: 0,
      calculated_recipe_count: 0,
      excluded_non_stock_count: 0,
      unresolved_count: 0,
      ratio_percent_total: 0,
      calculated_ratio_percent: 0,
      excluded_non_stock_ratio_percent: 0,
      unresolved_ratio_percent: 0,
      complete: true,
    }

    function addIssue(message) {
      const normalized = text(message)
      if (!normalized || issueKeys.has(normalized)) return
      issueKeys.add(normalized)
      issues.push(normalized)
      audit.unresolved_count += 1
      audit.complete = false
    }

    function addMaterial(material, fraction, pathLabel) {
      const materialId = text(material.id)
      const materialName = text(material.item_name)
      if (!materialId || !materialName || isPlaceholderName(materialName)) {
        addIssue(`${pathLabel}: 원재료 연결 확인 필요`)
        return
      }

      if (material.is_stock_managed === false) {
        audit.excluded_non_stock_count += 1
        audit.excluded_non_stock_ratio_percent += fraction * 100
        return
      }

      const previous = materialFractions.get(materialId) || {
        material,
        fraction: 0,
        source_paths: [],
      }
      previous.fraction += fraction
      if (!previous.source_paths.includes(pathLabel)) previous.source_paths.push(pathLabel)
      materialFractions.set(materialId, previous)
      audit.calculated_recipe_count += 1
      audit.calculated_ratio_percent += fraction * 100
    }

    function walk(currentProductId, currentProductName, pathFraction, depth, pathIds, pathNames) {
      if (depth > MAX_RECIPE_DEPTH) {
        addIssue(`${currentProductName}: 반제품 전개 최대 ${MAX_RECIPE_DEPTH}단계 초과`)
        return
      }

      const productRecipes = recipesByProduct.get(currentProductId) || []
      if (!productRecipes.length) {
        addIssue(`${currentProductName}: 활성 레시피 없음`)
        return
      }

      const ratioTotal = productRecipes.reduce((sum, recipe) => sum + Math.max(0, num(recipe.ratio_percent)), 0)
      if (depth === 0) audit.ratio_percent_total = ratioTotal
      if (Math.abs(ratioTotal - 100) > RATIO_TOLERANCE) {
        addIssue(`${currentProductName}: 배합비 합계 ${ratioTotal.toFixed(3)}%`)
      }

      for (const recipe of productRecipes) {
        audit.recipe_count += 1
        const ratio = num(recipe.ratio_percent)
        if (!(ratio > 0)) continue
        const nextFraction = pathFraction * ratio / 100
        const recipeItemName = text(recipe.food_type_name) || '재료명 없음'
        const ingredientType = text(recipe.ingredient_type)

        if (isSemiIngredient(ingredientType)) {
          const linkedMaterial = resolveMaterial(recipe)
          const nextProductId = text(recipe.semi_product_id) || text(linkedMaterial?.linked_product_id)
          if (!nextProductId) {
            addIssue(`${currentProductName} · ${recipeItemName}: 연결 반제품 미설정`)
            audit.unresolved_ratio_percent += nextFraction * 100
            continue
          }
          if (pathIds.includes(nextProductId)) {
            addIssue(`${[...pathNames, text(productById.get(nextProductId)?.product_name) || nextProductId].join(' → ')}: 순환 연결 감지`)
            audit.unresolved_ratio_percent += nextFraction * 100
            continue
          }

          const nextProductName = text(productById.get(nextProductId)?.product_name) || text(linkedMaterial?.item_name) || nextProductId
          walk(
            nextProductId,
            nextProductName,
            nextFraction,
            depth + 1,
            [...pathIds, nextProductId],
            [...pathNames, nextProductName],
          )
          continue
        }

        if (!isRawIngredient(ingredientType)) continue
        const material = resolveMaterial(recipe)
        if (!material) {
          addIssue(`${currentProductName} · ${recipeItemName}: 원재료 연결 확인 필요`)
          audit.unresolved_ratio_percent += nextFraction * 100
          continue
        }

        addMaterial(material, nextFraction, `${pathNames.join(' → ')} · ${recipeItemName}`)
      }
    }

    const rootName = text(productById.get(cacheKey)?.product_name) || text(productName) || cacheKey
    if (!cacheKey) addIssue(`${rootName}: 제품 연결 정보 없음`)
    else walk(cacheKey, rootName, 1, 0, [cacheKey], [rootName])

    const result = {
      materials: Array.from(materialFractions.values()),
      issues,
      audit: {
        ...audit,
        ratio_percent_total: Number(audit.ratio_percent_total.toFixed(3)),
        calculated_ratio_percent: Number(audit.calculated_ratio_percent.toFixed(3)),
        excluded_non_stock_ratio_percent: Number(audit.excluded_non_stock_ratio_percent.toFixed(3)),
        unresolved_ratio_percent: Number(audit.unresolved_ratio_percent.toFixed(3)),
      },
    }
    formulaCache.set(cacheKey, result)
    return result
  }

  return { expandFormula }
}

function buildRequirements(events, engine) {
  const totals = new Map()
  const datedUsage = new Map()
  const issues = []
  const issueKeys = new Set()
  const productAudits = new Map()

  for (const event of events) {
    const productId = text(event.product_id)
    const productName = text(event.product_name)
    const expansion = engine.expandFormula(productId, productName)
    productAudits.set(productId || `name:${productName}`, expansion.audit)

    expansion.issues.forEach((reason) => {
      const key = `${productId}::${reason}`
      if (issueKeys.has(key)) return
      issueKeys.add(key)
      issues.push({ product_id: productId, product_name: productName, reason })
    })

    for (const component of expansion.materials) {
      const material = component.material
      const materialId = text(material.id)
      const requiredG = Math.max(0, num(event.planned_quantity_g) * num(component.fraction))
      if (!materialId || !(requiredG > 0)) continue

      const current = totals.get(materialId) || {
        material_id: materialId,
        material_name: text(material.item_name),
        current_stock_g: Math.round(num(material.current_stock_g)),
        required_g: 0,
      }
      current.required_g += requiredG
      totals.set(materialId, current)

      datedUsage.set(materialId, [...(datedUsage.get(materialId) || []), {
        date: text(event.plan_date),
        product_name: productName,
        recipe_item: component.source_paths.join(' / '),
        required_g: requiredG,
      }])
    }
  }

  const requirements = Array.from(totals.values()).map((row) => {
    const currentStock = Math.round(num(row.current_stock_g))
    const required = Math.round(num(row.required_g))
    let balance = currentStock
    let firstShortageDate = null

    const details = (datedUsage.get(text(row.material_id)) || [])
      .sort((a, b) => text(a.date).localeCompare(text(b.date)))
      .map((usage) => {
        balance -= num(usage.required_g)
        if (!firstShortageDate && balance < 0) firstShortageDate = text(usage.date)
        return {
          ...usage,
          required_g: Math.round(num(usage.required_g)),
          projected_balance_g: Math.round(balance),
        }
      })

    const projected = currentStock - required
    return {
      ...row,
      required_g: required,
      projected_balance_g: projected,
      shortage_g: Math.max(0, -projected),
      first_shortage_date: firstShortageDate,
      status: projected < 0 ? '부족' : projected < currentStock * 0.15 ? '주의' : '충분',
      details,
    }
  }).sort((a, b) => num(b.shortage_g) - num(a.shortage_g) || text(a.material_name).localeCompare(text(b.material_name), 'ko'))

  const audits = Array.from(productAudits.values())
  const validation = {
    complete: issues.length === 0 && audits.every((audit) => audit.complete),
    product_count: audits.length,
    recipe_count: audits.reduce((sum, audit) => sum + num(audit.recipe_count), 0),
    calculated_recipe_count: audits.reduce((sum, audit) => sum + num(audit.calculated_recipe_count), 0),
    excluded_non_stock_count: audits.reduce((sum, audit) => sum + num(audit.excluded_non_stock_count), 0),
    unresolved_count: audits.reduce((sum, audit) => sum + num(audit.unresolved_count), 0),
    products: audits,
  }

  return { requirements, issues, validation }
}

export async function GET(request) {
  try {
    const month = text(request.nextUrl.searchParams.get('month')) || new Date().toISOString().slice(0, 7)
    const level = text(request.nextUrl.searchParams.get('level')) || 'standard'
    const businessId = text(request.nextUrl.searchParams.get('business_id')) || DEFAULT_BUSINESS_ID
    const { start, end } = monthRange(month)
    const supabase = createMoniServiceRoleClient()

    const [plans, historyRecords, products, recipes, mappings, materials] = await Promise.all([
      fetchAll(
        () => supabase.from('monthly_production_plans').select('*').gte('plan_date', start).lte('plan_date', end).order('plan_date').order('created_at'),
        '월간 예상 계획 조회 실패',
      ),
      fetchAll(
        () => supabase
          .from('production_records')
          .select('id, work_date, product_id, product_name, planned_quantity_g, actual_quantity_g, status')
          .lt('work_date', start)
          .in('status', ['완료', 'completed'])
          .order('work_date')
          .order('id'),
        '생산 이력 조회 실패',
      ),
      fetchAll(
        () => supabase.from('products').select('id, product_name, is_active, business_id').eq('is_active', true).order('product_name').order('id'),
        '제품 목록 조회 실패',
      ),
      fetchAll(
        () => supabase
          .from('recipes')
          .select('id, product_id, product_name, food_type_id, food_type_name, ratio_percent, ingredient_type, semi_product_id, is_active, sort_order, business_id')
          .eq('is_active', true)
          .order('product_id')
          .order('sort_order')
          .order('id'),
        '활성 레시피 전체 조회 실패',
      ),
      fetchAll(
        () => supabase
          .from('raw_material_mapping')
          .select('id, mapping_scope, recipe_id, product_id, food_type_id, raw_material_ref_id, raw_material_id, raw_material_name, is_default, business_id, created_at')
          .eq('is_default', true)
          .order('created_at')
          .order('id'),
        '원재료 매핑 전체 조회 실패',
      ),
      fetchAll(
        () => supabase
          .from('raw_materials')
          .select('id, item_name, current_stock_g, is_active, is_stock_managed, business_id, linked_product_id, semifinished_usage_type')
          .order('item_name')
          .order('id'),
        '원재료 마스터 전체 조회 실패',
      ),
    ])

    const normalizedPlans = plans.map((row) => ({ ...row, source: 'user' }))
    const forecasts = buildForecasts(historyRecords, normalizedPlans, month, level)
    const engine = createRecipeEngine({ recipes, mappings, materials, products, businessId })
    const confirmed = buildRequirements(normalizedPlans, engine)
    const aiOnly = buildRequirements(forecasts, engine)

    const productOptions = Array.from(new Map(
      products.map((row) => [text(row.id), { id: text(row.id), name: text(row.product_name), business_id: text(row.business_id) }]),
    ).values())
      .filter((product) => product.id && product.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

    return NextResponse.json({
      ok: true,
      month,
      level,
      plans: normalizedPlans,
      forecasts,
      products: productOptions,
      confirmed,
      ai_only: aiOnly,
      with_ai: aiOnly,
      source_counts: {
        recipes: recipes.length,
        mappings: mappings.length,
        materials: materials.length,
      },
      calculation_basis: 'recursive_recipe_expansion',
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '월간 생산계획 조회에 실패했습니다.' },
      { status: 500 },
    )
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const quantity = Math.round(num(body.planned_quantity_g))
    if (!text(body.plan_date) || !text(body.product_id) || !text(body.product_name) || quantity <= 0) {
      return NextResponse.json({ ok: false, error: '생산일, 제품, 생산예정량을 확인해 주세요.' }, { status: 400 })
    }

    const result = await createMoniServiceRoleClient().from('monthly_production_plans').insert({
      plan_date: text(body.plan_date),
      product_id: text(body.product_id),
      product_name: text(body.product_name),
      planned_quantity_g: quantity,
      note: text(body.note) || null,
      business_id: text(body.business_id) || 'default',
    }).select('*').single()

    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true, plan: result.data })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '생산계획 저장에 실패했습니다.' },
      { status: 500 },
    )
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json()
    if (!text(body.id)) return NextResponse.json({ ok: false, error: '계획 ID가 필요합니다.' }, { status: 400 })

    const result = await createMoniServiceRoleClient().from('monthly_production_plans').update({
      plan_date: text(body.plan_date),
      product_id: text(body.product_id),
      product_name: text(body.product_name),
      planned_quantity_g: Math.round(num(body.planned_quantity_g)),
      note: text(body.note) || null,
      updated_at: new Date().toISOString(),
    }).eq('id', text(body.id)).select('*').single()

    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true, plan: result.data })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '생산계획 수정에 실패했습니다.' },
      { status: 500 },
    )
  }
}

export async function DELETE(request) {
  try {
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok: false, error: '계획 ID가 필요합니다.' }, { status: 400 })

    const result = await createMoniServiceRoleClient().from('monthly_production_plans').delete().eq('id', id)
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '생산계획 삭제에 실패했습니다.' },
      { status: 500 },
    )
  }
}
