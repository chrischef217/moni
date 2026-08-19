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

test('domains without a PC inactive state do not open a fake deactivation card', () => {
  for (const input of [
    '생산단위 비활성화해줘',
    '레시피 비활성화해줘',
    '영업기회 비활성화해줘',
    '영업활동 비활성화해줘',
    '생산 프리랜서 작업시간 비활성화해줘',
  ]) {
    assert.equal(extended.classifyMobileExtendedIntent(input), null, input)
  }
})

test('supported master domains retain non-destructive deactivation routing', () => {
  assert.deepEqual(extended.classifyMobileExtendedIntent('원재료 비활성화해줘'), { domain: 'raw_material_master', operation: 'DEACTIVATE' })
  assert.deepEqual(extended.classifyMobileExtendedIntent('부재료 비활성화해줘'), { domain: 'packaging_master', operation: 'DEACTIVATE' })
  assert.deepEqual(extended.classifyMobileExtendedIntent('거래처 비활성화해줘'), { domain: 'sales_client', operation: 'DEACTIVATE' })
  assert.deepEqual(extended.classifyMobileExtendedIntent('직원 비활성화해줘'), { domain: 'business_person', operation: 'DEACTIVATE' })
  assert.deepEqual(extended.classifyMobileExtendedIntent('판매규격 비활성화해줘'), { domain: 'sales_pricing', operation: 'DEACTIVATE' })
})

test('destructive delete remains explicit where the PC form supports delete', () => {
  assert.deepEqual(extended.classifyMobileExtendedIntent('생산단위 삭제해줘'), { domain: 'production_unit', operation: 'DELETE' })
  assert.deepEqual(extended.classifyMobileExtendedIntent('레시피 삭제해줘'), { domain: 'recipe', operation: 'DELETE' })
  assert.deepEqual(extended.classifyMobileExtendedIntent('영업활동 삭제해줘'), { domain: 'business_activity', operation: 'DELETE' })
  assert.deepEqual(extended.classifyMobileExtendedIntent('생산 프리랜서 작업시간 삭제해줘'), { domain: 'business_work_log', operation: 'DELETE' })
})
