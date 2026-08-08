import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = join(process.cwd(), 'src')
const TABLE_CALL = /\.from\(\s*['"]([^'"]+)['"]\s*\)/g

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else if (/\.(?:ts|tsx|js|jsx)$/.test(name)) out.push(full)
  }
  return out
}

function normalize(file) {
  return relative(process.cwd(), file).split(sep).join('/')
}

function executionKind(file, source) {
  if (/^\s*['"]use client['"];?/m.test(source)) return 'CLIENT_EXPLICIT'
  if (/^\s*import\s+['"]server-only['"]/m.test(source) || file.includes('/app/api/')) return 'SERVER_EXPLICIT'
  return 'SHARED_OR_UNKNOWN'
}

function clientHints(source) {
  const hints = []
  if (/\bcreateMoniServiceRoleClient\b/.test(source)) hints.push('MONI_SERVICE_ROLE_FACTORY')
  if (/\bmoniAdmin\b/.test(source)) hints.push('MONI_ADMIN_SERVICE_ROLE')
  if (/\bmoniDb\b/.test(source)) hints.push('MONI_ANON_CLIENT')
  if (/\bmoniBrowserDb\b/.test(source)) hints.push('MONI_BROWSER_STORAGE_CLIENT')
  if (/from\s+['"]@supabase\/supabase-js['"]/.test(source) && /\bcreateClient\s*\(/.test(source)) hints.push('DIRECT_CREATE_CLIENT')
  if (/from\s+['"](?:@\/lib\/supabase|\.\.?\/[^'"]*supabase)['"]/.test(source)) hints.push('LEGACY_SHARED_SUPABASE')
  return hints.length ? hints : ['UNCLASSIFIED']
}

const callsites = []
for (const file of walk(ROOT)) {
  const source = readFileSync(file, 'utf8')
  const tables = [...new Set([...source.matchAll(TABLE_CALL)].map((match) => match[1]))].sort()
  if (!tables.length) continue
  callsites.push({
    file: normalize(file),
    execution: executionKind(file, source),
    client_hints: clientHints(source),
    tables,
  })
}

callsites.sort((a, b) => a.file.localeCompare(b.file))
const tableIndex = {}
for (const callsite of callsites) {
  for (const table of callsite.tables) {
    tableIndex[table] ||= []
    tableIndex[table].push({
      file: callsite.file,
      execution: callsite.execution,
      client_hints: callsite.client_hints,
    })
  }
}

console.log('MONI_SUPABASE_TABLE_CALLSITE_AUDIT_START')
console.log(JSON.stringify({
  callsite_file_count: callsites.length,
  table_count: Object.keys(tableIndex).length,
  callsites,
  tables: Object.fromEntries(Object.entries(tableIndex).sort(([a], [b]) => a.localeCompare(b))),
}, null, 2))
console.log('MONI_SUPABASE_TABLE_CALLSITE_AUDIT_END')
