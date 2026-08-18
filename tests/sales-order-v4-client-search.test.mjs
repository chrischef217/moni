import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const enhancer = readFileSync('src/components/SalesOrderClientSearchEnhancer.tsx', 'utf8')
const shell = readFileSync('src/components/BusinessManagementIntegratedShell.tsx', 'utf8')

test('PC product sales mounts searchable client combobox enhancer', () => {
  assert.match(shell, /SalesOrderClientSearchEnhancer/)
  assert.match(shell, /salesV4View/)
})

test('client combobox lists every active option from the existing sales select and filters as text is typed', () => {
  assert.match(enhancer, /Array\.from\(nativeSelect\.options\)/)
  assert.match(enhancer, /거래처명 입력 또는 선택/)
  assert.match(enhancer, /normalize\(option\.name\)\.includes\(needle\)/)
  assert.match(enhancer, /전체 거래처 \$\{options\.length\}개/)
})

test('typing a different client clears the previous client id and selecting a result dispatches the existing React change path', () => {
  assert.match(enhancer, /setNativeSelectValue\(nativeSelect, ''\)/)
  assert.match(enhancer, /setNativeSelectValue\(nativeSelect, option\.id\)/)
  assert.match(enhancer, /dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/)
})

test('client search supports keyboard confirmation and does not create arbitrary customer ids', () => {
  assert.match(enhancer, /event\.key === 'Enter'/)
  assert.match(enhancer, /selectClient\(filtered\[0\]\.id\)/)
  assert.doesNotMatch(enhancer, /crypto\.randomUUID|create.*client|insert.*client/i)
})
