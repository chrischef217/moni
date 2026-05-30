import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ValidationLevel = 'success' | 'warning' | 'error'

type ValidationResponse = {
  ok: true
  valid: boolean
  level: ValidationLevel
  suggestion: string | null
  message: string
  score?: number | null
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s'".,()/\\_-]+/g, '')
    .trim()
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(text(value).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function buildResponse(response: ValidationResponse) {
  return NextResponse.json(response, { status: 200 })
}

function bigrams(value: string) {
  if (value.length < 2) return [value]
  const pairs: string[] = []
  for (let index = 0; index < value.length - 1; index += 1) {
    pairs.push(value.slice(index, index + 2))
  }
  return pairs
}

function diceCoefficient(left: string, right: string) {
  if (!left || !right) return 0
  if (left === right) return 1

  const leftPairs = bigrams(left)
  const rightPairs = bigrams(right)
  const rightCounts = new Map<string, number>()

  for (const pair of rightPairs) {
    rightCounts.set(pair, (rightCounts.get(pair) ?? 0) + 1)
  }

  let intersection = 0
  for (const pair of leftPairs) {
    const remaining = rightCounts.get(pair) ?? 0
    if (remaining > 0) {
      intersection += 1
      rightCounts.set(pair, remaining - 1)
    }
  }

  return (2 * intersection) / (leftPairs.length + rightPairs.length)
}

function calculateSimilarity(input: string, candidate: string) {
  const normalizedInput = normalizeName(input)
  const normalizedCandidate = normalizeName(candidate)
  if (!normalizedInput || !normalizedCandidate) return 0
  if (normalizedInput === normalizedCandidate) return 100

  const longerLength = Math.max(normalizedInput.length, normalizedCandidate.length)
  const shorterLength = Math.min(normalizedInput.length, normalizedCandidate.length)
  const lengthScore = longerLength > 0 ? (shorterLength / longerLength) * 100 : 0
  const contains =
    normalizedCandidate.includes(normalizedInput) || normalizedInput.includes(normalizedCandidate)
      ? 1
      : 0
  const containmentScore = contains ? 85 + lengthScore * 0.15 : 0
  const diceScore = diceCoefficient(normalizedInput, normalizedCandidate) * 100
  const mixedScore = diceScore * 0.65 + lengthScore * 0.35

  return Math.round(Math.max(containmentScore, mixedScore))
}

async function validateProductName(value: string) {
  if (!value) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'error',
      suggestion: null,
      message: '제품명을 입력해주세요',
    })
  }

  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('mfds_products')
    .select('product_name')
    .eq('is_active', true)
    .limit(5000)

  if (error) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'error',
      suggestion: null,
      message: error.message || '식약처 등록 제품 목록을 불러오지 못했습니다',
    })
  }

  const names = ((data ?? []) as Array<{ product_name?: string | null }>)
    .map((row) => text(row.product_name))
    .filter(Boolean)

  if (names.length === 0) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'error',
      suggestion: null,
      message: '식약처 등록 제품이 없습니다',
    })
  }

  let bestName: string | null = null
  let bestScore = 0
  for (const name of names) {
    const score = calculateSimilarity(value, name)
    if (score > bestScore) {
      bestScore = score
      bestName = name
    }
  }

  if (bestName && bestScore >= 85) {
    const normalizedInput = normalizeName(value)
    const normalizedSuggestion = normalizeName(bestName)
    return buildResponse({
      ok: true,
      valid: true,
      level: 'success',
      suggestion: bestName,
      message:
        normalizedInput === normalizedSuggestion ? '식약처 등록 제품입니다' : '공식명으로 저장됩니다',
      score: bestScore,
    })
  }

  if (bestName && bestScore >= 50) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'warning',
      suggestion: bestName,
      message: `혹시 [${bestName}]인가요?`,
      score: bestScore,
    })
  }

  return buildResponse({
    ok: true,
    valid: false,
    level: 'error',
    suggestion: null,
    message: '식약처 미등록 제품입니다',
    score: bestScore,
  })
}

async function validateRawMaterialName(value: string) {
  if (!value) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'error',
      suggestion: null,
      message: '원재료명을 입력해주세요',
    })
  }

  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase.from('raw_materials').select('item_name').limit(5000)

  if (error) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'error',
      suggestion: null,
      message: error.message || '기존 원재료 목록을 불러오지 못했습니다',
    })
  }

  const names = ((data ?? []) as Array<{ item_name?: string | null }>)
    .map((row) => text(row.item_name))
    .filter(Boolean)

  let bestName: string | null = null
  let bestScore = 0
  for (const name of names) {
    const score = calculateSimilarity(value, name)
    if (score > bestScore) {
      bestScore = score
      bestName = name
    }
  }

  if (bestName && bestScore >= 85) {
    return buildResponse({
      ok: true,
      valid: true,
      level: 'success',
      suggestion: bestName,
      message: `기존 원재료 [${bestName}]로 저장됩니다`,
      score: bestScore,
    })
  }

  if (bestName && bestScore >= 50) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'warning',
      suggestion: bestName,
      message: `기존 원재료 [${bestName}]과 같은 원료인가요?`,
      score: bestScore,
    })
  }

  return buildResponse({
    ok: true,
    valid: true,
    level: 'success',
    suggestion: null,
    message: '새 원재료로 등록됩니다',
    score: bestScore,
  })
}

function validateQuantity(value: string) {
  const quantity = parseNumber(value)
  if (quantity === null || quantity <= 0) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'error',
      suggestion: null,
      message: '수량을 입력해주세요',
    })
  }

  if (quantity < 100) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'error',
      suggestion: null,
      message: '100g 미만입니다. 단위를 확인해주세요(g 단위)',
    })
  }

  if (quantity > 10_000_000) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'error',
      suggestion: null,
      message: '10톤 초과입니다. 수량을 확인해주세요',
    })
  }

  return buildResponse({
    ok: true,
    valid: true,
    level: 'success',
    suggestion: null,
    message: '정상 범위의 생산량입니다',
  })
}

function validateWorkDate(value: string) {
  if (!value) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'error',
      suggestion: null,
      message: '날짜를 입력해주세요',
    })
  }

  const date = new Date(`${value}T00:00:00+09:00`)
  if (Number.isNaN(date.getTime())) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'error',
      suggestion: null,
      message: '유효한 날짜를 입력해주세요',
    })
  }

  const today = new Date()
  const todayKst = new Date(
    today.toLocaleString('en-US', {
      timeZone: 'Asia/Seoul',
    }),
  )
  todayKst.setHours(0, 0, 0, 0)

  if (date.getTime() > todayKst.getTime()) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'error',
      suggestion: null,
      message: '미래 날짜는 입력할 수 없습니다',
    })
  }

  const days180Ago = new Date(todayKst)
  days180Ago.setDate(days180Ago.getDate() - 180)
  if (date.getTime() < days180Ago.getTime()) {
    return buildResponse({
      ok: true,
      valid: false,
      level: 'warning',
      suggestion: null,
      message: '6개월 이전 기록입니다. 과거 실적 입력이 맞나요?',
    })
  }

  return buildResponse({
    ok: true,
    valid: true,
    level: 'success',
    suggestion: null,
    message: '입력 가능한 날짜입니다',
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { field?: string; value?: string }
      | null

    const field = text(body?.field)
    const value = text(body?.value)

    if (!field) {
      return NextResponse.json({ ok: false, error: 'field가 필요합니다' }, { status: 400 })
    }

    if (field === 'product_name') return validateProductName(value)
    if (field === 'quantity_g') return validateQuantity(value)
    if (field === 'work_date') return validateWorkDate(value)
    if (field === 'raw_material_name') return validateRawMaterialName(value)

    return NextResponse.json({ ok: false, error: '지원하지 않는 field입니다' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '검증 처리 중 오류가 발생했습니다'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
