import fs from 'node:fs'

const page = fs.readFileSync('src/app/mobile/page.tsx', 'utf8')
const guard = fs.readFileSync('src/components/MoniMobileVoiceTouchGuard.tsx', 'utf8')
const runtime = fs.readFileSync('src/components/MoniMobileRuntimeGuard.tsx', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

const failures = []
const expect = (condition, message) => {
  if (!condition) failures.push(message)
}

expect(page.includes("import MoniMobileVoiceTouchGuard from '@/components/MoniMobileVoiceTouchGuard'"), 'mobile page must import MoniMobileVoiceTouchGuard')
expect(page.includes('<MoniMobileVoiceTouchGuard />'), 'mobile page must mount MoniMobileVoiceTouchGuard')
expect(page.indexOf('<MoniMobileRuntimeGuard />') < page.indexOf('<MoniMobileVoiceTouchGuard />'), 'voice touch guard must mount after RuntimeGuard')
expect(guard.includes('CHAT_FALLBACK_TIMEOUT_MS = 900'), 'guard must identify the legacy 900ms voice fallback')
expect(guard.includes('NON_VOICE_BYPASS_TIMEOUT_MS = 901'), 'guard must bypass unrelated 900ms timers')
expect(guard.includes('expectVoiceFallback'), 'guard must scope the fallback to recognition.stop()')
expect(guard.includes('this.inner.stop()'), 'guard must delegate to the recorder-backed recognition')
expect(guard.includes('VOICE_TARGET_SELECTOR'), 'guard must observe voice UI lifecycle')
expect(guard.includes('releaseInteractionSurface'), 'guard must release mobile interaction after voice completion')
expect(guard.includes('document.elementFromPoint'), 'guard must detect an unexpected full-screen tap blocker')
expect(guard.includes('pointerEvents'), 'guard must recover stale pointer-event locks')
expect(runtime.includes('Number(timeout) === 900'), 'legacy runtime 900ms compatibility shim must still be present for guarded voice fallback')
expect(String(pkg.scripts?.prebuild || '').includes('verify-moni-mobile-voice-touch.mjs'), 'prebuild must run the voice touch regression gate')

if (failures.length) {
  console.error('MONI mobile voice touch verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('MONI mobile voice touch verification passed.')
