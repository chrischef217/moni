import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const page = read('src/app/mobile/page.tsx')
const bridge = read('src/components/MoniMobilePhotoInboundBridge.tsx')
const camera = read('src/components/MoniMobileCameraCaptureGuard.tsx')
const touch = read('src/components/MoniMobilePhotoTouchGuard.tsx')
const submittedTray = read('src/components/MoniMobileSubmittedPhotoTrayGuard.tsx')
const enhancer = read('src/components/MoniMobilePhotoRawInboundEnhancer.tsx')
const route = read('src/app/api/moni/mobile-photo-raw-inbound/route.ts')
const mobileActions = read('src/app/api/moni/mobile-actions-v2/route.ts')
const middleware = read('src/middleware.ts')
const migration = read('supabase/migrations/202609030001_mobile_raw_material_photo_inbound.sql')

const checks = [
  [page.includes('<MoniMobileCameraCaptureGuard />'), 'mobile page must mount Android camera picker guard'],
  [page.includes('<MoniMobilePhotoInboundBridge />'), 'mobile page must mount raw-photo bridge'],
  [page.includes('<MoniMobilePhotoTouchGuard />'), 'mobile page must mount photo touch recovery'],
  [page.includes('<MoniMobileSubmittedPhotoTrayGuard />'), 'mobile page must clear submitted photos from composer'],
  [page.includes('<MoniMobilePhotoRawInboundEnhancer />'), 'mobile page must mount raw inbound photo fields'],
  [camera.includes("camera.accept = 'image/*'"), 'camera picker must use broad image accept token for Android native capture'],
  [camera.includes("camera.setAttribute('capture', 'environment')"), 'camera picker must request the rear-facing native camera'],
  [camera.includes("camera.removeAttribute('multiple')"), 'camera picker must remain a single-capture input'],
  [camera.includes("gallery.removeAttribute('capture')"), 'gallery picker must never inherit native camera capture'],
  [camera.includes('gallery.multiple = true'), 'gallery picker must keep multi-select behavior'],
  [camera.includes("document.addEventListener('pointerdown', onPointerDown, true)"), 'camera attributes must be hardened before the user click opens the picker'],
  [bridge.includes("'/api/moni/mobile-photo-raw-inbound'"), 'raw-material photo turn must route to dedicated vision endpoint'],
  [bridge.includes('attachmentIds.length'), 'generic text turns must not be routed as photo inbound'],
  [route.includes('사진에서 실제로 보이는 증거'), 'vision instructions must forbid unsupported inference'],
  [route.includes('package_count'), 'vision result must include package count'],
  [route.includes('expiry_date'), 'vision result must include expiry date'],
  [route.includes('matched_material_id'), 'vision result must map to canonical raw-material master'],
  [route.includes('raw_material_inbound_workflow_id'), 'photo workflow must persist across follow-up evidence'],
  [route.includes("structured_action_card: true"), 'photo analysis must open structured inbound workflow'],
  [mobileActions.includes('unit_price_per_kg'), 'photo card must cross-check master price'],
  [mobileActions.includes('packing_weight_g'), 'photo card must cross-check master packing weight'],
  [mobileActions.includes('evidence_attachment_ids'), 'photo evidence must travel into confirmation payload'],
  [mobileActions.includes('isPhotoInboundContinuation'), 'expiry-only photo followup must keep the inbound draft alive'],
  [mobileActions.includes('latestPhotoWorkflow'), 'card enrichment must use structured photo workflow metadata'],
  [mobileActions.includes("operation: 'CREATE'"), 'photo continuation must be able to synthesize a create draft'],
  [enhancer.includes('expiration_kind'), 'raw inbound card must expose expiry kind'],
  [enhancer.includes('expiration_date'), 'raw inbound card must expose expiry date'],
  [middleware.includes("pathname === '/api/moni/mobile-actions'"), 'mobile-actions must route through photo-aware V2'],
  [middleware.includes("url.pathname='/api/moni/mobile-actions-v2'"), 'mobile-actions rewrite target must be V2'],
  [migration.includes('expiration_kind text'), 'raw transaction schema must persist expiry kind'],
  [migration.includes('expiration_date date'), 'raw transaction schema must persist expiry date'],
  [migration.includes('evidence_attachment_ids uuid[]'), 'raw transaction schema must persist photo evidence ids'],
  [migration.includes('moni_execute_raw_material_transaction_action_core_v1'), 'existing stock mutation must remain the canonical core'],

  // Core interaction regression gate: recovery must be passive and user-driven.
  [touch.includes("removeAttribute('inert')"), 'photo recovery must release explicit inert locks'],
  [touch.includes("element.style.pointerEvents === 'none'"), 'photo recovery must release explicit pointer-events locks'],
  [touch.includes('releaseKnownStaleLocks'), 'photo recovery must have a bounded stale-lock cleanup path'],
  [touch.includes("root.querySelector<HTMLButtonElement>(NEW_CHAT_SELECTOR)"), 'new-conversation control must be part of targeted recovery'],
  [touch.includes("root.querySelector<HTMLButtonElement>(SEND_SELECTOR)"), 'send control must be part of targeted recovery'],
  [touch.includes('form.requestSubmit(control)'), 'intercepted send taps must fall back to the real form submit path'],
  [touch.includes('control.click()'), 'intercepted new-chat taps must fall back to the real React click path'],
  [touch.includes("document.addEventListener('pointerdown', handlePointer, true)"), 'Android pointer taps must support targeted recovery'],
  [touch.includes("document.addEventListener('touchstart', handleLegacyTouch, true)"), 'legacy touch devices must support targeted recovery'],
  [!touch.includes('window.setInterval('), 'interaction recovery must not continuously mutate live controls'],
  [!touch.includes("attributeFilter: ['class', 'style', 'inert', 'disabled']"), 'recovery must not watch React disabled/style changes and fight rendering'],
  [!touch.includes('normalizeIdleControls'), 'recovery must not globally rewrite React disabled state'],
  [!touch.includes("style.setProperty('pointer-events', 'none', 'important')"), 'recovery must never disable arbitrary layers with pointer-events none'],
  [!touch.includes('elementFromPoint('), 'recovery must not continuously retarget arbitrary DOM layers'],

  [submittedTray.includes("'moni:user-turn-start'"), 'submitted photo cleanup must happen at turn submission'],
  [submittedTray.includes("style.display = 'none'"), 'submitted photo tray must leave the composer while request is running'],
  [submittedTray.includes('restoreSubmittedTrays'), 'failed sends must restore retryable photo UI'],
]

const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  for (const [, message] of failed) console.error(`FAIL: ${message}`)
  process.exit(1)
}
console.log('MONI mobile raw-material photo inbound verification passed.')
