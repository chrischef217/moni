import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = join(process.cwd(), 'src')
const ACTIONS_FILE = join(ROOT, 'lib', 'actions.ts')

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

function classify(file, source) {
  if (/^\s*['"]use client['"];?/m.test(source)) return 'CLIENT_EXPLICIT'
  if (/^\s*import\s+['"]server-only['"]/m.test(source) || file.includes('/app/api/')) return 'SERVER_EXPLICIT'
  return 'SHARED_OR_UNKNOWN'
}

const actionSource = readFileSync(ACTIONS_FILE, 'utf8')
const exported = [...new Set([...actionSource.matchAll(/export\s+async\s+function\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]))].sort()
const callers = Object.fromEntries(exported.map((name) => [name, []]))
const imports = []

for (const file of walk(ROOT)) {
  if (file === ACTIONS_FILE) continue
  const source = readFileSync(file, 'utf8')
  const path = normalize(file)
  const execution = classify(file, source)
  const importRegex = /import\s*\{([\s\S]*?)\}\s*from\s*['"](?:@\/lib\/actions|\.\.?\/[^'"]*actions)['"]/g
  for (const match of source.matchAll(importRegex)) {
    const names = match[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const parts = item.split(/\s+as\s+/)
        return { imported: parts[0].trim(), local: (parts[1] || parts[0]).trim() }
      })
    imports.push({ file: path, execution, names })
    for (const item of names) {
      if (!callers[item.imported]) continue
      const escaped = item.local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const usageCount = (source.match(new RegExp(`\\b${escaped}\\s*\\(`, 'g')) || []).length
      callers[item.imported].push({ file: path, execution, local_name: item.local, usage_count: usageCount })
    }
  }
}

const used = Object.fromEntries(Object.entries(callers).filter(([, refs]) => refs.length > 0))
const unused = exported.filter((name) => callers[name].length === 0)

console.log('MONI_ACTIONS_CALLSITE_AUDIT_START')
console.log(JSON.stringify({
  exported_count: exported.length,
  exported_functions: exported,
  imported_function_count: Object.keys(used).length,
  imported_functions: used,
  unused_export_count: unused.length,
  unused_exports: unused,
  importer_count: imports.length,
  importers: imports,
}, null, 2))
console.log('MONI_ACTIONS_CALLSITE_AUDIT_END')
