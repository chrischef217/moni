import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const enhancer = readFileSync('src/components/SalesOrderClientSearchEnhancer.tsx', 'utf8')
const alerts = readFileSync('src/components/GlobalAlertSyncController.tsx', 'utf8')
const orders = readFileSync('src/app/api/moni/sales-orders-v4/route.ts', 'utf8')

test('PC sales registration keeps a new client selection empty until the user chooses one', () => {
  assert.match(enhancer, /제품 판매등록/)
  assert.match(enhancer, /setNativeSelectValue\(nativeSelect, ''\)/)
})

test('sales save validation and server failures are visible inside the open modal', () => {
  assert.match(alerts, /data-sales-save-message/)
  assert.match(alerts, /거래처를 선택해 주세요/)
  assert.match(alerts, /판매품목의 판매규격을 선택해 주세요/)
  assert.match(alerts, /판매품목의 수량을 확인해 주세요/)
  assert.match(alerts, /판매품목의 판매단가를 확인해 주세요/)
  assert.match(alerts, /currentSalesPageError/)
})

test('backdated sales switch the visible month after a confirmed save', () => {
  assert.match(alerts, /pendingSaleMonth/)
  assert.match(alerts, /input\[type="month"\]/)
  assert.match(alerts, /setNativeInputValue\(monthInput, pendingSaleMonth\)/)
})

test('visible PC sessions are refreshed and an expired authenticated shell reloads to login', () => {
  assert.match(alerts, /10 \* 60 \* 1000/)
  assert.match(alerts, /response\.status === 401 \|\| response\.status === 403/)
  assert.match(alerts, /window\.location\.reload\(\)/)
  assert.match(alerts, /window\.addEventListener\('focus'/)
  assert.match(alerts, /visibilityState === 'visible'/)
})

test('sales server continues to reject missing business inputs rather than inventing values', () => {
  assert.match(orders, /판매 품목을 한 개 이상 입력해 주세요/)
  assert.match(orders, /판매규격을 선택해 주세요/)
  assert.match(orders, /판매단가를 설정해 주세요/)
})
