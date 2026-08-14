import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const mobile = readFileSync('src/components/MoniMobileMvp.tsx', 'utf8')

test('mobile MVP is session protected and keeps freelancer boundary', () => {
  assert.match(page, /getSessionFromCookies/)
  assert.match(page, /if \(!session\)/)
  assert.match(page, /session\.role === 'freelancer'/)
  assert.match(page, /redirect\('\/freelancer'\)/)
})

test('mobile MVP is conversation first with a compact lookup drawer', () => {
  assert.match(mobile, /무엇을 도와드릴까요\?/)
  assert.match(mobile, /MONI에게 메시지 보내기/)
  assert.match(mobile, /기본 조회/)
  assert.match(mobile, /월간 생산계획/)
  assert.match(mobile, /완제품 재고/)
  assert.match(mobile, /수금 · 미수금/)
})

test('mobile MVP hands off to the Custom GPT without enabling MONI server model inference', () => {
  assert.match(mobile, /chatgpt\.com\/g\/g-6a7af9094b08819183be32a5dc97ef7b-moni/)
  assert.doesNotMatch(mobile, /\/api\/moni\/agent-runtime/)
  assert.doesNotMatch(mobile, /\/api\/moni\/chat/)
  assert.doesNotMatch(mobile, /openai/i)
  assert.doesNotMatch(mobile, /anthropic/i)
})

test('mobile MVP accounts for mobile safe areas and dynamic viewport height', () => {
  assert.match(mobile, /100dvh/)
  assert.match(mobile, /env\(safe-area-inset-top\)/)
  assert.match(mobile, /env\(safe-area-inset-bottom\)/)
})
