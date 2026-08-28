import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const boundary = readFileSync('src/components/MoniMobileTurnBoundaryReset.tsx', 'utf8')
const hygiene = readFileSync('src/components/MoniMobileTurnHygieneGuard.tsx', 'utf8')
const interaction = readFileSync('src/components/MoniMobileInteractionPolish.tsx', 'utf8')

const failures = []
const requireText = (source, token, message) => { if (!source.includes(token)) failures.push(message) }

requireText(page, 'MoniMobileTurnBoundaryReset', 'mobile page must mount the fresh-turn boundary reset guard')
requireText(boundary, "const USER_TURN_START_EVENT = 'moni:user-turn-start'", 'turn reset guard must bind to the real user-turn event')
requireText(boundary, "root.dataset.moniThinkingStage = 'normal'", 'new turns must force thinking stage back to normal')
requireText(boundary, "root.dataset.moniHeartbeatStage = 'normal'", 'new turns must force heartbeat stage back to normal')
requireText(boundary, "root.dataset.moniHeartbeatOvertime = 'false'", 'new turns must clear previous overtime state')
requireText(boundary, "root.dataset.moniTurnResetPending = 'true'", 'new turns must hold a presentation reset gate until fresh progress arrives')
requireText(boundary, "attributeFilter", 'turn reset guard must watch stale stage rewrites during the handoff window')
requireText(boundary, "character.classList.remove('moni-thinking-spin', 'moni-heartbeat-character-hit')", 'new turns must clear previous overdrive animation residue')
requireText(hygiene, 'releaseResetGateWhenFresh', 'existing hygiene guard must still release the reset gate only on fresh progress')
requireText(interaction, 'activeStartedAt = Date.now()', 'adaptive ETA must still establish a per-request clock')
requireText(interaction, 'thinkingStage(elapsedSeconds, activeEstimateSeconds)', 'thinking escalation must still derive from the current request elapsed time')

if (failures.length) {
  console.error('MONI mobile turn reset verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MONI mobile turn reset verification passed.')
