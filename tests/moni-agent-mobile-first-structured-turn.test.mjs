import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const chat = readFileSync('src/components/MoniMobileChat.tsx', 'utf8')
const startRoute = readFileSync('src/app/api/moni/mobile-action-start/route.ts', 'utf8')
const intents = readFileSync('src/lib/moni/mobile-business-intents.ts', 'utf8')

test('sales statement creation is a distinct structured write, not an ordinary sales synonym', () => {
  assert.match(intents, /\| 'sales_statement'/)
  assert.match(intents, /domain: 'sales_statement', operation: 'CREATE'/)
  assert.match(intents, /domain: 'sales_statement', operation: 'SHOW'/)
  assert.match(intents, /\(판매\|납품\|매출\)/)
  assert.doesNotMatch(intents, /\(판매\|납품\|거래명세\|매출\)/)
})

test('structured writes use mobile action start even before a local thread exists', () => {
  assert.match(chat, /structuredRequest \? '\/api\/moni\/mobile-action-start' : '\/api\/moni\/agent-runtime'/)
  assert.doesNotMatch(chat, /structuredRequest && threadId \? '\/api\/moni\/mobile-action-start'/)
})

test('mobile action start bootstraps a MONI thread instead of rejecting the first structured turn', () => {
  assert.doesNotMatch(startRoute, /MONI 대화방이 준비되지 않았습니다/)
  assert.match(startRoute, /from\('moni_ai_threads'\)\.insert/)
  assert.match(startRoute, /user_login_id: session\.loginId/)
  assert.match(startRoute, /threadId = createdThread\.data\.id/)
})
