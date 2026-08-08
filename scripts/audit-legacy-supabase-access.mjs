import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = join(process.cwd(), 'src')
const SHARED_SUPABASE_IMPORT = /import\s+[^;\n]*\bfrom\s+['"]([^'"]*\/?supabase)['"]/g
const TABLE_CALL = /\.from\(\s*['"]([^'"]+)['"]\s*\)/g
const DIRECT_FACTORY_IMPORT = /from\s+['"]@supabase\/supabase-js['"]/g
const CREATE_CLIENT_CALL = /\bcreateClient\s*\(/g
const ENV_REF = /process\.env\.([A-Z0-9_]+)/g
const MONI_BROWSER_IMPORT = /from\s+['"](?:@\/lib\/moni\/browser-db|\.\.?\/[^'"]*browser-db)['"]/g

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

function normalize(path) {
  return relative(process.cwd(), path).split(sep).join('/')
}

function classify(file, source) {
  if (/^\s*['"]use client['"];?/m.test(source)) return 'CLIENT_EXPLICIT'
  if (/^\s*import\s+['"]server-only['"]/m.test(source) || file.includes('/app/api/')) return 'SERVER_EXPLICIT'
  return 'SHARED_OR_UNKNOWN'
}

const files = walk(ROOT)
const findings = []
const factories = []
const browserDbConsumers = []
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const imports = [...source.matchAll(SHARED_SUPABASE_IMPORT)].map((match) => match[1])
  const directPublicImport = imports.some((value) => value === './supabase' || value === '@/lib/supabase' || value.endsWith('/lib/supabase'))
  const tables = [...new Set([...source.matchAll(TABLE_CALL)].map((match) => match[1]))].sort()
  if (directPublicImport) findings.push({ file: normalize(file), execution: classify(file, source), tables })
  if (MONI_BROWSER_IMPORT.test(source)) browserDbConsumers.push({ file: normalize(file), execution: classify(file, source), tables })
  MONI_BROWSER_IMPORT.lastIndex = 0

  if (DIRECT_FACTORY_IMPORT.test(source) && CREATE_CLIENT_CALL.test(source)) {
    factories.push({
      file: normalize(file),
      execution: classify(file, source),
      create_client_calls: (source.match(CREATE_CLIENT_CALL) || []).length,
      environment_refs: [...new Set([...source.matchAll(ENV_REF)].map((match) => match[1]))].sort(),
      tables,
      server_only: /^\s*import\s+['"]server-only['"]/m.test(source),
    })
  }
  DIRECT_FACTORY_IMPORT.lastIndex = 0
  CREATE_CLIENT_CALL.lastIndex = 0
}

findings.sort((a, b) => a.file.localeCompare(b.file))
factories.sort((a, b) => a.file.localeCompare(b.file))
browserDbConsumers.sort((a, b) => a.file.localeCompare(b.file))
const tableToFiles = {}
for (const finding of findings) {
  for (const table of finding.tables) {
    tableToFiles[table] ||= []
    tableToFiles[table].push(finding.file)
  }
}

console.log('MONI_LEGACY_SUPABASE_AUDIT_START')
console.log(JSON.stringify({
  direct_public_supabase_importer_count: findings.length,
  direct_public_supabase_importers: findings,
  table_count: Object.keys(tableToFiles).length,
  tables: Object.fromEntries(Object.entries(tableToFiles).sort(([a], [b]) => a.localeCompare(b))),
  browser_db_consumer_count: browserDbConsumers.length,
  browser_db_consumers: browserDbConsumers,
  direct_create_client_file_count: factories.length,
  direct_create_client_files: factories,
}, null, 2))
console.log('MONI_LEGACY_SUPABASE_AUDIT_END')
