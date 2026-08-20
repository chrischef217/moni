import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')
const unified = read('src/components/CounterpartyManagementUnified.tsx')
const ledgerApi = read('src/app/api/moni/counterparty-ledger/route.ts')
const shell = read('src/components/BusinessManagementIntegratedShell.tsx')
const purchaseRouter = read('src/components/PurchaseManagementRouter.tsx')
const menu = read('src/components/SalesManagementMenuController.tsx')
const statement = read('src/components/DomesticSalesStatementPrintView.tsx')
const statementApi = read('src/app/api/moni/sales-statement/route.ts')
const enhancer = read('src/components/SalesStatementsUnifiedEnhancer.tsx')

test('purchase and sales counterparty directories share one management component', () => {
  assert.match(purchaseRouter, /CounterpartyManagementUnified kind="purchase"/)
  assert.match(shell, /CounterpartyManagementUnified[^\n]*kind="sales"/)
  assert.match(unified, /매입처 관리/)
  assert.match(unified, /매출처 관리/)
  assert.match(unified, /매입내역/)
  assert.match(unified, /매출내역/)
  assert.match(unified, /const activeCount = parties\.filter\(\(row\) => String\(row\.status\)\.toUpperCase\(\) === 'ACTIVE'\)\.length/)
  assert.doesNotMatch(unified, /activeCount[^\n]*\+ parties\.filter/)
})

test('counterparty ledger is searchable and paginated account-book data', () => {
  for (const label of ['날짜','구분','항목','수량','단가','합계','잔액']) assert.ok(unified.includes(label), `${label} column missing`)
  assert.match(unified, /counterparty-ledger/)
  assert.match(unified, /page_size:'20'/)
  assert.match(unified, /날짜·항목·번호 검색/)
  assert.match(ledgerApi, /purchase_payments/)
  assert.match(ledgerApi, /sales_receipts/)
  assert.match(ledgerApi, /balance = money\(balance \+ event\.amount\)/)
  assert.match(ledgerApi, /const BUSINESS_ID = '20220523011'/)
  assert.match(ledgerApi, /금액|amount_verified/)
})

test('sales client menu is explicitly named 매출처 관리', () => {
  assert.match(menu, /label: '매출처 관리', view: 'clients'/)
  assert.doesNotMatch(menu, /label: '거래처 관리', view: 'clients'/)
})

test('domestic statement restores approved dual-copy A4 design', () => {
  assert.match(statement, /공급받는자 보관용/)
  assert.match(statement, /공급자 보관용/)
  assert.match(statement, /절 취 선/)
  assert.match(statement, /width:210mm/)
  assert.match(statement, /height:297mm/)
  assert.match(statement, /#2942ef/)
  assert.match(statement, /#d62828/)
  assert.match(statement, /합계금액 \(부가세 포함\)/)
  assert.match(statement, /payment-account-number/)
  assert.match(statement, /전미수잔액/)
  assert.match(statement, /총미수잔액/)
})

test('statement payload is canonical and output action routes to restored view', () => {
  assert.match(statementApi, /const BUSINESS_ID = '20220523011'/)
  assert.match(statementApi, /sales_receipts/)
  assert.match(statementApi, /company_profile/)
  assert.match(enhancer, /sales-management\/orders\/\$\{encodeURIComponent\(String\(selected\.id\)\)\}\/statement\?auto=1/)
  assert.match(enhancer, /document\.addEventListener\('click',printCapture,true\)/)
})

test('mixed supplier history is not guessed inside UI or ledger code', () => {
  assert.doesNotMatch(unified, /정우통상,\s*두손푸드웨이/)
  assert.doesNotMatch(ledgerApi, /정우통상,\s*두손푸드웨이/)
})
