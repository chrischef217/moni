import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CANONICAL_MONI_BUSINESS_ID,
  aggregateMaterialRequirements,
  canExecuteConfirmation,
  hasProductionMutationIntent,
  isExplicitApproval,
  kgToGrams,
  monthRange,
  normalizeProductionStatus,
  parseRequestedYearMonth,
} from '../src/lib/moni/v1-contracts.ts'

test('canonical business id is immutable V1 scope', () => {
  assert.equal(CANONICAL_MONI_BUSINESS_ID, '20220523011')
})

test('month parser accepts Korean and compact dates and rejects missing month', () => {
  assert.deepEqual(parseRequestedYearMonth('2026년 7월 경영 분석'), { year: 2026, month: 7 })
  assert.deepEqual(parseRequestedYearMonth('2026-12 생산 현황'), { year: 2026, month: 12 })
  assert.deepEqual(monthRange(2024, 2), { start: '2024-02-01', end: '2024-02-29' })
  assert.throws(() => parseRequestedYearMonth('이번 달 분석'), /연도와 월/)
})

test('kg to grams conversion occurs exactly once at the boundary', () => {
  assert.equal(kgToGrams(1), 1000)
  assert.equal(kgToGrams(1.234), 1234)
  assert.equal(kgToGrams(0), 0)
  assert.throws(() => kgToGrams(-1), /0 이상/)
})

test('production statuses normalize without merging workflow stages', () => {
  assert.equal(normalizeProductionStatus('완료'), 'completed')
  assert.equal(normalizeProductionStatus('confirmed'), 'confirmed')
  assert.equal(normalizeProductionStatus('planned'), 'planned')
  assert.equal(normalizeProductionStatus('취소'), 'cancelled')
  assert.notEqual(normalizeProductionStatus('완료'), normalizeProductionStatus('확정'))
})

test('explicit approval rejects negated or ambiguous text', () => {
  assert.equal(isExplicitApproval('위 미리보기 그대로 실행해 주세요'), true)
  assert.equal(isExplicitApproval('승인합니다'), true)
  assert.equal(isExplicitApproval('승인하지 마세요'), false)
  assert.equal(isExplicitApproval('내용을 검토했습니다'), false)
})

test('confirmation state blocks replay and expiry', () => {
  const now = Date.parse('2026-08-13T00:00:00Z')
  assert.deepEqual(canExecuteConfirmation('PENDING', '2026-08-13T00:10:00Z', now), { allowed: true, reason: null })
  assert.deepEqual(canExecuteConfirmation('EXECUTED', '2026-08-13T00:10:00Z', now), { allowed: false, reason: 'confirmation_not_pending' })
  assert.deepEqual(canExecuteConfirmation('PENDING', '2026-08-12T23:59:59Z', now), { allowed: false, reason: 'confirmation_expired' })
})

test('read-only questions cannot be treated as production mutations', () => {
  assert.equal(hasProductionMutationIntent('7월 생산실적을 분석해 줘'), false)
  assert.equal(hasProductionMutationIntent('내일 작업지시를 등록해 줘'), true)
  assert.equal(hasProductionMutationIntent('이 생산완료를 확정 처리해 줘'), true)
})

test('material requirements aggregate by material without unit conversion', () => {
  assert.deepEqual(aggregateMaterialRequirements([
    { material_id: 'B', required_g: 100 },
    { material_id: 'A', required_g: 250 },
    { material_id: 'B', required_g: 50 },
  ]), [
    { material_id: 'A', required_g: 250 },
    { material_id: 'B', required_g: 150 },
  ])
})
