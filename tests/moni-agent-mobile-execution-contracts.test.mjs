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
const adapter = readFileSync('src/app/api/moni/mobile-extended-actions-v2/route.ts', 'utf8')
const legacyRoute = readFileSync('src/app/api/moni/mobile-extended-actions/route.ts', 'utf8')
const businessApi = readFileSync('src/app/api/moni/business-management/route.js', 'utf8')
const nextConfig = readFileSync('next.config.mjs', 'utf8')

test('employee work-time wording does not open the production-freelancer work-log card', () => {
  assert.equal(extended.classifyMobileExtendedIntent('직원 근무시간 수정해줘'), null)
  assert.deepEqual(extended.classifyMobileExtendedIntent('생산 프리랜서 작업시간 수정해줘'), { domain: 'business_work_log', operation: 'UPDATE' })
})

test('the public mobile extended endpoint is routed through the compatibility adapter', () => {
  assert.match(nextConfig, /source: '\/api\/moni\/mobile-extended-actions'/)
  assert.match(nextConfig, /destination: '\/api\/moni\/mobile-extended-actions-v2'/)
  assert.match(adapter, /GET as legacyGET, POST as legacyPOST/)
})

test('activity and production-freelancer work-log drafts expose canonical existing records', () => {
  assert.match(adapter, /from\('sales_activities'\)[\s\S]*?\.eq\('business_id', BUSINESS_ID\)/)
  assert.match(adapter, /from\('freelancer_work_logs'\)[\s\S]*?\.eq\('business_id', BUSINESS_ID\)/)
  assert.match(adapter, /card\.domain === 'business_activity'[\s\S]*?candidates:/)
  assert.match(adapter, /candidates: \(logs\.data \?\? \[\]\)\.map/)
})

test('work-log edit preparation reads the same canonical table as the PC API', () => {
  assert.match(businessApi, /work_logs:\s*\{[\s\S]*?table:\s*'freelancer_work_logs'/)
  assert.match(adapter, /from\('freelancer_work_logs'\)\.select\('\*'\)\.eq\('id', targetId\)\.eq\('business_id', BUSINESS_ID\)/)
  assert.doesNotMatch(adapter, /production_freelancer_work_logs/)
})

test('work-log update and delete reuse the PC business-management API behind confirmation locking', () => {
  assert.match(adapter, /domain === 'business_work_log'/)
  assert.match(adapter, /const entity = 'work_logs'/)
  assert.match(adapter, /operation === 'DELETE'[\s\S]*?business-management\?entity=\$\{entity\}&id=/)
  assert.match(adapter, /'PATCH', \{ entity, id: targetId, data: fields \}/)
  assert.match(adapter, /status: 'EXECUTING'/)
  assert.match(adapter, /status: 'EXECUTED'/)
  assert.match(adapter, /moni_action_audit_log/)
})

test('people deletion follows the PC non-destructive inactive policy', () => {
  assert.match(businessApi, /\['people', 'clients', 'settlements'\]\.includes\(entity\)/)
  assert.match(adapter, /domain === 'business_person' && operation === 'DELETE'/)
  assert.match(adapter, /entity: 'people'[\s\S]*?status: 'inactive'/)
})

test('all unaffected extended domains still delegate to the established route', () => {
  assert.match(adapter, /return legacyPOST\(request\)/)
  assert.match(adapter, /const response = await legacyGET\(request\)/)
  assert.match(legacyRoute, /domain==='product_master'/)
  assert.match(legacyRoute, /domain==='recipe'/)
  assert.match(legacyRoute, /domain==='receivable'/)
  assert.match(legacyRoute, /domain==='sales_pricing'/)
})
