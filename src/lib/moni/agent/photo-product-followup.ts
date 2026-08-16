import type { MoniAgentToolContext } from '@/lib/moni/agent/context-types'

const text = (value: unknown, max = 1200) => String(value ?? '').trim().slice(0, max)

type RecentMessage = { role: string; content: string }

type ProductRow = {
  id: string | null
  product_name: string | null
  product_code: string | null
  product_type: string | null
  is_active: boolean | null
}

export type PhotoProductMasterResult = {
  answer: string
  candidateNames: string[]
  matchedProducts: ProductRow[]
  activeProductCount: number
  durationMs: number
}

function normalizeName(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, '')
    .trim()
}

function recentPhotoContext(history: RecentMessage[]) {
  return history
    .slice(-8)
    .map((item) => text(item.content, 2400))
    .join('\n')
}

function cleanCandidate(value: string) {
  return value
    .replace(/^[\s:：,.;·•-]+|[\s:：,.;·•-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractCandidateNames(history: RecentMessage[]) {
  const assistantText = history
    .slice(-8)
    .reverse()
    .find((item) => item.role === 'assistant' && /(사진|라벨|제품|로고)/i.test(item.content))
    ?.content || ''

  const candidates: string[] = []
  const quotedPatterns = [/[“”]([^“”]{2,90})[“”]/g, /"([^"\n]{2,90})"/g, /'([^'\n]{2,90})'/g]
  for (const pattern of quotedPatterns) {
    for (const match of assistantText.matchAll(pattern)) {
      const candidate = cleanCandidate(match[1] || '')
      if (candidate && candidate.length <= 90) candidates.push(candidate)
    }
  }

  const labelMatch = assistantText.match(/(?:라벨(?:에는|에)?|제품명(?:은|:)?)[\s"“”']*([^\n,.]{2,90})/i)?.[1]
  if (labelMatch) candidates.push(cleanCandidate(labelMatch))

  return [...new Set(candidates)]
    .filter((candidate) => {
      const normalized = normalizeName(candidate)
      if (normalized.length < 2) return false
      return !/^(손세정제|핸드워시|핸드솝|handsoap|액상비누|제품|라벨|사진)$/.test(normalized)
    })
    .slice(0, 6)
}

export function isPhotoProductMasterFollowupRequest(message: string, role: string, history: RecentMessage[]) {
  if (String(role || '').toLowerCase() !== 'admin') return false
  const normalized = String(message || '').replace(/\s+/g, ' ').trim()
  const asksOurProduct = /(?:우리|당사|회사)\s*(?:제품|품목)|제품\s*마스터|(?:등록|취급)\s*(?:제품|품목)|(?:제품|품목).{0,10}(?:등록|취급)/.test(normalized)
  const asksCheck = /(?:있|없|맞|등록|체크|확인|찾|조회)/.test(normalized)
  if (!asksOurProduct || !asksCheck) return false
  const context = recentPhotoContext(history)
  return /(사진|첨부|이미지|라벨|로고|hand\s*soap|제품으로\s*보)/i.test(context)
}

export async function resolvePhotoProductMasterFollowup(
  context: MoniAgentToolContext,
  history: RecentMessage[],
): Promise<PhotoProductMasterResult> {
  const startedAt = Date.now()
  const { data, count, error } = await context.supabase
    .from('products')
    .select('id,product_name,product_code,product_type,is_active', { count: 'exact' })
    .eq('business_id', context.businessId)
    .eq('is_active', true)
    .order('product_name', { ascending: true })
    .limit(200)
  if (error) throw new Error(`제품 마스터 조회 실패: ${error.message}`)

  const products = (data ?? []) as ProductRow[]
  const activeProductCount = Number(count ?? products.length)
  const candidateNames = extractCandidateNames(history)

  // Only compare names that were actually extracted from the latest photo analysis.
  // Never scan the whole conversation for product names: unrelated earlier MONI
  // messages can contain valid company products and would create false matches.
  const matchedProducts = candidateNames.length
    ? products.filter((product) => {
        const names = [product.product_name, product.product_code, product.id]
          .map(normalizeName)
          .filter((value) => value.length >= 3)
        return names.some((name) => candidateNames.some((candidate) => {
          const normalizedCandidate = normalizeName(candidate)
          return normalizedCandidate === name
            || (name.length >= 4 && normalizedCandidate.includes(name))
            || (normalizedCandidate.length >= 4 && name.includes(normalizedCandidate))
        }))
      })
    : []

  const candidateLabel = candidateNames.length
    ? candidateNames.slice(0, 2).map((name) => `**${name}**`).join(', ')
    : ''

  const answer = !candidateNames.length
    ? '직전 사진 분석에서 제품 마스터와 비교할 **정확한 제품명 또는 라벨명**을 확정하지 못했습니다. 임의의 동의어로 반복 검색하지 않았습니다. 제품명이 보이는 사진을 다시 첨부해 주세요.'
    : matchedProducts.length
      ? `직전 사진의 ${candidateLabel} 기준으로 공식 활성 제품 마스터를 직접 확인했습니다.\n\n우리 제품으로 확인되는 항목은 다음과 같습니다.\n${matchedProducts.slice(0, 5).map((product) => `- **${text(product.product_name, 160) || '이름 미등록'}**${product.id ? ` · ${text(product.id, 80)}` : ''}`).join('\n')}`
      : `직전 사진의 ${candidateLabel} 기준으로 공식 활성 제품 마스터 **${activeProductCount}건**을 직접 확인했지만 일치하는 제품이 없습니다.\n\n따라서 현재 두배의 등록 제품으로는 확인되지 않습니다.`

  return {
    answer,
    candidateNames,
    matchedProducts,
    activeProductCount,
    durationMs: Date.now() - startedAt,
  }
}
