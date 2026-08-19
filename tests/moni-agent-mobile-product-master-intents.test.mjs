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

test('natural product master create update delete and deactivate phrases open the product card', () => {
  assert.deepEqual(extended.classifyMobileExtendedIntent('제품 등록해줘'), { domain: 'product_master', operation: 'CREATE' })
  assert.deepEqual(extended.classifyMobileExtendedIntent('제품 수정해줘'), { domain: 'product_master', operation: 'UPDATE' })
  assert.deepEqual(extended.classifyMobileExtendedIntent('품목 삭제해줘'), { domain: 'product_master', operation: 'DELETE' })
  assert.deepEqual(extended.classifyMobileExtendedIntent('제품 비활성화해줘'), { domain: 'product_master', operation: 'DEACTIVATE' })
})

test('product business operations never fall into the product master fallback', () => {
  for (const input of [
    '제품 재고 수정해줘',
    '제품 판매 수정해줘',
    '제품 판매단가 수정해줘',
    '제품 가격 수정해줘',
    '제품 레시피 수정해줘',
    '제품 생산단위 수정해줘',
    '제품 생산계획 수정해줘',
    '제품 작업지시 수정해줘',
  ]) {
    const intent = extended.classifyMobileExtendedIntent(input)
    assert.notDeepEqual(intent, { domain: 'product_master', operation: 'UPDATE' }, input)
  }
})

test('read-only product questions still remain normal MONI questions', () => {
  assert.equal(extended.classifyMobileExtendedIntent('제품 목록 보여줘'), null)
  assert.equal(extended.classifyMobileExtendedIntent('제품 정보 알려줘'), null)
})
