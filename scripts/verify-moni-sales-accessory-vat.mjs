import fs from 'node:fs'

const middleware = fs.readFileSync('src/middleware.ts', 'utf8')
const enhancer = fs.readFileSync('src/components/SalesAccessoryChargeEnhancer.tsx', 'utf8')
const v6 = fs.readFileSync('src/app/api/moni/sales-orders-v6/route.ts', 'utf8')

const checks = [
  [middleware.includes("pathname='/api/moni/sales-orders-v6'"), 'sales-orders-v4 must route to V6 so extra_items persist'],
  [enhancer.includes('extra_items:collectCharges()'), 'PC sales save must send accessory charges'],
  [enhancer.includes('단가(부가세 별도)'), 'accessory UI must state that entered prices exclude VAT'],
  [enhancer.includes('기타비용 VAT'), 'accessory UI must expose accessory VAT'],
  [enhancer.includes('syncBaseSummary'), 'base supply/VAT/total cards must be synchronized with accessory charges'],
  [v6.includes('prepareAccessoryCharges(data.extra_items)'), 'V6 must parse accessory charges'],
  [v6.includes('const supplyAmount = money(baseSupply + chargeSupply)'), 'V6 must add accessory supply to order supply'],
  [v6.includes('const vatAmount = money(supplyAmount * vatRate / 100)'), 'V6 must apply the order VAT rate to accessory-inclusive supply'],
]

const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  for (const [, message] of failed) console.error(`FAIL: ${message}`)
  process.exit(1)
}

console.log('MONI sales accessory VAT verification passed.')
