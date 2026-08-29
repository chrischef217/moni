import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/lib/moni/mobile-business-intents.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const moduleBox = { exports: {} }
new Function('module', 'exports', compiled)(moduleBox, moduleBox.exports)
const { classifyMobileBusinessIntent } = moduleBox.exports

test('work-order list request stays on read path', () => {
  assert.equal(classifyMobileBusinessIntent('이번 달 생산에 관련된 작업지시서 내역 리스트업 좀 해줘'), null)
  assert.equal(classifyMobileBusinessIntent('이번 달 작업지시서 목록 조회해줘'), null)
  assert.equal(classifyMobileBusinessIntent('8월 작업지시 내역 보여줘'), null)
})

test('other read requests ending in 해줘 do not become writes', () => {
  assert.equal(classifyMobileBusinessIntent('8월 매출 내역 조회해줘'), null)
  assert.equal(classifyMobileBusinessIntent('이번 달 매입 내역 보여줘'), null)
  assert.equal(classifyMobileBusinessIntent('원재료 입고 내역 조회해줘'), null)
})

test('explicit write requests still open write cards', () => {
  assert.deepEqual(classifyMobileBusinessIntent('작업지시 해줘'), { domain: 'production_work', operation: 'CREATE' })
  assert.deepEqual(classifyMobileBusinessIntent('생산계획 등록해줘'), { domain: 'production_plan', operation: 'CREATE' })
  assert.deepEqual(classifyMobileBusinessIntent('매출 등록해줘'), { domain: 'sales_order', operation: 'CREATE' })
})
