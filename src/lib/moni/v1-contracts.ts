export const CANONICAL_MONI_BUSINESS_ID = '20220523011'

export function parseRequestedYearMonth(message: string) {
  const normalized = String(message || '').replace(/\s+/g, ' ')
  const korean = normalized.match(/(20\d{2})\s*년\s*(1[0-2]|0?[1-9])\s*월/)
  const compact = normalized.match(/(20\d{2})[-/.](1[0-2]|0?[1-9])(?:\b|월)/)
  const match = korean || compact
  if (!match) throw new Error('월간 종합 조회에는 사용자 요청에 연도와 월이 필요합니다. 예: 2026년 7월')
  return { year: Number(match[1]), month: Number(match[2]) }
}

export function monthRange(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('유효한 연도와 월이 필요합니다.')
  }
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return { start, end }
}

export function kgToGrams(value: unknown) {
  const kg = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(kg) || kg < 0) throw new Error('kg 수량은 0 이상의 유한한 숫자여야 합니다.')
  const grams = Math.round(kg * 1000)
  if (!Number.isSafeInteger(grams)) throw new Error('kg → g 변환 결과가 안전한 정수 범위를 벗어났습니다.')
  return grams
}

export function normalizeProductionStatus(value: unknown) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (['planned', 'plan', 'scheduled', '예정'].includes(raw)) return 'planned'
  if (['completed', 'complete', 'done', '완료'].includes(raw)) return 'completed'
  if (['confirmed', 'confirm', '확정'].includes(raw)) return 'confirmed'
  if (['cancelled', 'canceled', '취소'].includes(raw)) return 'cancelled'
  if (raw === 'confirming') return 'confirming'
  return raw
}

export function isExplicitApproval(value: string) {
  const message = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (!message) return false
  if (/(취소|보류|멈춰|하지\s*마|하지마|실행하지|진행하지|아니야|아니요)/.test(message)) return false
  return /(^|\s)(확인|승인|동의)(?:합니다|해요|할게요|함)?(\.|!|\s|$)|그대로\s*(실행|진행|처리)|(?:실행|진행|처리)해(?:줘|주세요|라|요)?|위\s*(?:미리보기|내용).*(?:실행|진행|처리)|^(네|예|응|좋아)[.!]?$/i.test(message)
}

export function hasProductionMutationIntent(value: string) {
  const message = String(value || '').replace(/\s+/g, ' ').trim()
  if (!message) return false
  const object = /(생산계획|작업지시|작업지시서|생산완료|생산확정|원재료\s*차감)/
  const mutation = /(등록|생성|만들|추가|수정|변경|취소|삭제|완료\s*(?:처리|입력|해|시켜)|확정\s*(?:처리|해|시켜)|차감\s*(?:처리|해|시켜)|실행|진행)/
  return object.test(message) && mutation.test(message)
}

export function canExecuteConfirmation(status: unknown, expiresAt: unknown, now = Date.now()) {
  const normalized = String(status ?? '').trim().toUpperCase()
  if (normalized !== 'PENDING') return { allowed: false, reason: 'confirmation_not_pending' as const }
  const expires = Date.parse(String(expiresAt ?? ''))
  if (!Number.isFinite(expires) || expires <= now) return { allowed: false, reason: 'confirmation_expired' as const }
  return { allowed: true, reason: null }
}

export type MaterialRequirement = {
  material_id: string
  required_g: number
  [key: string]: unknown
}

export function aggregateMaterialRequirements(rows: MaterialRequirement[]) {
  const aggregated = new Map<string, MaterialRequirement>()
  for (const row of rows) {
    const materialId = String(row.material_id || '').trim()
    const requiredG = Number(row.required_g)
    if (!materialId || !Number.isFinite(requiredG) || requiredG <= 0) {
      throw new Error('material_id와 0보다 큰 required_g가 필요합니다.')
    }
    const previous = aggregated.get(materialId)
    aggregated.set(materialId, previous
      ? { ...previous, required_g: previous.required_g + requiredG }
      : { ...row, material_id: materialId, required_g: requiredG })
  }
  return [...aggregated.values()].sort((a, b) => a.material_id.localeCompare(b.material_id))
}
