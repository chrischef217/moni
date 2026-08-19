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
const businessApi = readFileSync('src/app/api/moni/business-management/route.js', 'utf8')

test('employee work-time wording does not open the production-freelancer work-log card', () => {
  assert.equal(extended.classifyMobileExtendedIntent('직원 근무시간 수정해줘'), null)
  assert.deepEqual(extended.classifyMobileExtendedIntent('생산 프리랜서 작업시간 수정해줘'), { domain: 'business_work_log', operation: 'UPDATE' })
})

test('mobile catalogs load activities and freelancer work logs for edit/delete candidates', () => {
  assert.match(mobileRoute, /db\.from\('sales_activities'\)[\s\S]*?\.eq\('business_id', BUSINESS_ID\)/)
  assert.match(mobileRoute, /db\.from\('freelancer_work_logs'\)[\s\S]*?\.eq\('business_id', BUSINESS_ID\)/)
  assert.match(mobileRoute, /activities: activities\.data \?\? \[\]/)
  assert.match(mobileRoute, /workLogs: workLogs\.data \?\? \[\]/)
})

test('activity and work-log cards expose existing records as candidates', () => {
  assert.match(mobileRoute, /business_activity[\s\S]*?c\.activities\.map/)
  assert.match(mobileRoute, /business_work_log[\s\S]*?c\.workLogs\.map/)
})

test('work-log before snapshot uses the same canonical table as the PC API', () => {
  assert.match(businessApi, /work_logs:\s*\{[\s\S]*?table:\s*'freelancer_work_logs'/)
  assert.match(mobileRoute, /business_work_log:'freelancer_work_logs'/)
  assert.doesNotMatch(mobileRoute, /business_work_log:'production_freelancer_work_logs'/)
})

test('work-log create update and delete reuse the PC business-management API', () => {
  assert.match(mobileRoute, /domain==='business_work_log'[\s\S]*?operation==='CREATE'[\s\S]*?entity:'work_logs'/)
  assert.match(mobileRoute, /domain==='business_work_log'[\s\S]*?operation==='DELETE'[\s\S]*?business-management\?entity=\$\{entity\}&id=/)
  assert.match(mobileRoute, /domain==='business_work_log'[\s\S]*?'PATCH'[\s\S]*?\{entity,id:targetId,data:fields\}/)
})

test('people deletion follows the PC non-destructive inactive policy', () => {
  assert.match(businessApi, /\['people', 'clients', 'settlements'\]\.includes\(entity\)/)
  assert.match(mobileRoute, /domain==='business_person'[\s\S]*?operation==='DELETE'\|\|operation==='DEACTIVATE'[\s\S]*?status:'inactive'/)
  assert.doesNotMatch(mobileRoute, /domain==='business_person'[\s\S]{0,900}?operation==='DELETE'\) return pcApi\(request,`\/api\/moni\/business-management\?entity=/)
})
