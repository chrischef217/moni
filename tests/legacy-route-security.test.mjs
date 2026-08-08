import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const cron = readFileSync('src/app/api/cron/morning-check/route.ts', 'utf8')
const excel = readFileSync('src/app/api/export/excel/route.ts', 'utf8')
const report = readFileSync('src/app/api/export/report/route.ts', 'utf8')
const word = readFileSync('src/app/api/export/word/route.ts', 'utf8')
const stock = readFileSync('src/lib/stock_alert_engine.ts', 'utf8')

for (const [name, source] of [
  ['morning cron', cron],
  ['legacy excel', excel],
  ['legacy report', report],
  ['legacy word', word],
]) {
  test(`${name} stays retired with no database access`, () => {
    assert.match(source, /status: 410/)
    assert.match(source, /X-MONI-Legacy-Route/)
    assert.doesNotMatch(source, /@\/lib\/supabase/)
    assert.doesNotMatch(source, /\.from\(/)
  })
}

test('retired legacy exports cannot call broad legacy actions or document engines', () => {
  for (const source of [excel, report, word]) assert.doesNotMatch(source, /@\/lib\/actions/)
  assert.doesNotMatch(excel, /xlsx/i)
  assert.doesNotMatch(report, /from 'docx'/)
  assert.doesNotMatch(word, /from 'docx'/)
})

test('legacy public DB actions module is removed and no source file imports it', () => {
  assert.equal(existsSync('src/lib/actions.ts'), false)

  function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? walk(full) : [full]
    })
  }

  const offenders = walk('src')
    .filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file))
    .filter((file) => /(?:@\/lib\/actions|\.\.?\/[^'"\n]*actions)/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [])
})

test('stock alert engine is server-only and does not use public anon Supabase client', () => {
  assert.match(stock, /import 'server-only'/)
  assert.match(stock, /createMoniServiceRoleClient/)
  assert.doesNotMatch(stock, /from ['"]\.\/supabase['"]/)
  assert.doesNotMatch(stock, /@\/lib\/supabase/)
})
