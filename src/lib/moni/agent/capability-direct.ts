import type { MoniAgentPageContext } from '@/lib/moni/agent/context-types'
import type { CapabilityPrefetch } from '@/lib/moni/agent/memory'
import { hasProductionMutationIntent } from '@/lib/moni/v1-contracts'

const DIRECT_MIN_SCORE = 100
const DIRECT_MIN_GAP = 35
const DIRECT_MAX_MESSAGE_LENGTH = 240

function normalized(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function isSimpleHowToQuestion(message: string) {
  const value = normalized(message)
  if (!value || value.length > DIRECT_MAX_MESSAGE_LENGTH) return false
  if (hasProductionMutationIntent(value)) return false

  const howTo = /(어디서|어디야|어디에|어디로|어디\s*있|어디\s*보|어디\s*봐|어떻게|무슨\s*메뉴|어느\s*메뉴|메뉴\s*(?:어디|경로|위치)|경로|사용법|방법|어디\s*관리|어디\s*등록|어디\s*수정|어디\s*변경|어디\s*설정|어디\s*다운로드)/i.test(value)
  if (!howTo) return false

  // Analysis, troubleshooting, numeric/data questions still need the full agent.
  if (/(왜|원인|문제|오류|에러|안\s*돼|안돼|못\s*해|분석|비교|판단|추천|얼마|몇\s*(?:개|건|곳|kg|g|원)|매출|재고\s*(?:얼마|몇)|실적)/i.test(value)) return false
  return true
}

function hasPermission(candidate: CapabilityPrefetch, role: string) {
  if (!candidate.permissions.length) return true
  return candidate.permissions.map((value) => value.toLowerCase()).includes(String(role || '').toLowerCase())
}

function isMobile(page: MoniAgentPageContext) {
  return String(page.pathname || '').startsWith('/mobile')
}

function mobileLine(candidate: CapabilityPrefetch, page: MoniAgentPageContext) {
  if (!isMobile(page)) return ''
  if (candidate.mobileSupport === 'SUPPORTED' && candidate.mobilePath.length) {
    return `모바일 경로: **${candidate.mobilePath.join(' → ')}**`
  }
  if (candidate.mobileSupport === 'PC_ONLY') {
    return '모바일 화면에서는 이 기능을 직접 수정하는 메뉴가 없고, PC MONI에서 처리합니다.'
  }
  if (candidate.mobileSupport === 'ASK_MONI') {
    return '모바일에서는 MONI 채팅으로 조회·요청할 수 있고, 직접 화면 조작이 필요하면 아래 PC 경로를 사용합니다.'
  }
  return '모바일 직접 경로는 아직 공식 확인되지 않았습니다. 아래 PC 경로만 확정 정보로 안내합니다.'
}

function answerFor(candidate: CapabilityPrefetch, page: MoniAgentPageContext, role: string) {
  const lines: string[] = []
  if (!hasPermission(candidate, role)) {
    lines.push(`**${candidate.featureName}** 기능은 현재 계정 권한에서 직접 사용할 수 있는 것으로 확인되지 않았습니다.`)
  } else {
    lines.push(`**${candidate.featureName}**은 여기서 합니다.`)
  }

  const mobile = mobileLine(candidate, page)
  if (mobile) lines.push(mobile)
  if (candidate.pcPath.length) lines.push(`PC 경로: **${candidate.pcPath.join(' → ')}**`)
  if (candidate.actionHint) lines.push(`실행 위치: ${candidate.actionHint}`)
  if (candidate.caveats.length) lines.push(`주의: ${candidate.caveats.join(' / ')}`)
  return lines.join('\n\n')
}

export type DirectCapabilityResolution = {
  candidate: CapabilityPrefetch
  answer: string
  confidenceGap: number
}

export function resolveDirectCapabilityHowTo(args: {
  message: string
  page: MoniAgentPageContext
  role: string
  candidates?: CapabilityPrefetch[]
}): DirectCapabilityResolution | null {
  if (!isSimpleHowToQuestion(args.message)) return null
  const candidates = args.candidates ?? []
  const first = candidates[0]
  if (!first || first.matchScore < DIRECT_MIN_SCORE) return null

  const second = candidates[1]
  const gap = second ? first.matchScore - second.matchScore : first.matchScore
  if (gap < DIRECT_MIN_GAP) return null

  return {
    candidate: first,
    answer: answerFor(first, args.page, args.role),
    confidenceGap: gap,
  }
}
