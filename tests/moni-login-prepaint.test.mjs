import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layout = readFileSync('src/app/layout.tsx', 'utf8')
const login = readFileSync('src/components/AllowanceLogin.tsx', 'utf8')
const loginCriticalStyle = layout.match(
  /const loginCriticalStyle = String\.raw`([\s\S]*?)`\n\nexport default async function RootLayout/,
)?.[1] ?? ''

test('root layout sends login critical CSS before body paint', () => {
  assert.match(layout, /const loginCriticalStyle = String\.raw`/)
  assert.match(layout, /data-moni-login-critical/)
  assert.match(layout, /\[data-moni-login\]\s*\{[\s\S]*position: fixed;/)
  assert.match(layout, /\[data-moni-login\] \.moni-login-card/)
  assert.match(layout, /\[data-moni-login\] \.moni-login-field input/)
  assert.match(layout, /\[data-moni-login\] \.moni-login-submit/)
})

test('critical selector matches the actual login root', () => {
  assert.match(login, /<main data-moni-login className="moni-login-root">/)
  assert.ok(loginCriticalStyle, 'login critical CSS must be extractable from the root layout')
  assert.doesNotMatch(loginCriticalStyle, /document\.|window\./)
})
