import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const cron = readFileSync('src/app/api/cron/morning-check/route.ts', 'utf8')
const excel = readFileSync('src/app/api/export/excel/route.ts', 'utf8')
const report = readFileSync('src/app/api/export/report/route.ts', 'utf8')
const stock = readFileSync('src/lib/stock_alert_engine.ts', 'utf8')

for (const [name, source] of [['morning cron', cron], ['legacy excel', excel], ['legacy report', report]]) {
  test(`${name} stays retired with no database access`, () => {
    assert.match(source, /status: 410/)
    assert.match(source, /X-MONI-Legacy-Route/)
    assert.doesNotMatch(source, /@\/lib\/supabase/)
    assert.doesNotMatch(source, /\.from\(/)
  })
}

test('retired legacy Excel route cannot call broad legacy actions', () => {
  assert.doesNotMatch(excel, /@\/lib\/actions/)
  assert.doesNotMatch(excel, /xlsx/i)
})

test('retired legacy report route cannot create unauthenticated documents', () => {
  assert.doesNotMatch(report, /from 'docx'/)
  assert.doesNotMatch(report, /new Document/)
})

test('stock alert engine is server-only and does not use public anon Supabase client', () => {
  assert.match(stock, /import 'server-only'/)
  assert.match(stock, /createMoniServiceRoleClient/)
  assert.doesNotMatch(stock, /from ['"]\.\/supabase['"]/)
  assert.doesNotMatch(stock, /@\/lib\/supabase/)
})
