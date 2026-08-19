import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

async function loadTsModule(path) {
  const source = readFileSync(path, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}

const extended = await loadTsModule('src/lib/moni/mobile-extended-intents.ts')
const mobileRoute = readFileSync('src/app/api/moni/mobile-extended-actions/route.ts', 'utf8')
const adjustmentApi = readFileSync('src/app/api/moni/finished-goods-inventory-adjustments/route.ts', 'utf8')

test('natural finished-goods stock correction wording opens the adjustment card', () => {
  for (const input of [
    '완제품 재고 수정해줘',
    '제품 재고 변경해줘',
    '완제품 재고 10kg로 맞춰줘',
    '제품 재고 보정해줘',
    '완제품 재고 실사 반영해줘',
  ]) {
    assert.deepEqual(extended.classifyMobileExtendedIntent(input), { domain: 'finished_goods_adjustment', operation: 'ADJUST' }, input)
  }
})

test('finished-goods stock reads and destructive language do not become adjustment writes', () => {
  assert.equal(extended.classifyMobileExtendedIntent('완제품 재고 보여줘'), null)
  assert.equal(extended.classifyMobileExtendedIntent('제품 재고 알려줘'), null)
  assert.equal(extended.classifyMobileExtendedIntent('완제품 재고 삭제해줘'), null)
})

test('mobile prepare computes the balance required by the PC adjustment API', () => {
  assert.match(adjustmentApi, /balanceBeforeG = num\(body\.balance_before_g\)/)
  assert.match(mobileRoute, /fields\.balance_before_g = await computeFinishedGoodsBalance/)
  assert.match(mobileRoute, /finished-goods-inventory-adjustments','POST',fields/)
})
