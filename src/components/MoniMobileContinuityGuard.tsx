'use client'

import { useLayoutEffect } from 'react'

const THREAD_KEY = 'moni-global-agent-thread-v11'
const RECOVERY_TIMEOUT_MS = 4 * 60_000
const RECOVERY_POLL_MS = 1200

type AgentBody = {
  message?: string
  attachment_ids?: string[]
  thread_id?: string
  page?: Record<string, unknown>
}

type StoredMessage = { role?: string; content?: string }

function normalize(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function pathOf(input: RequestInfo | URL) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  try { return new URL(raw, window.location.href).pathname } catch { return raw }
}

function isPost(init?: RequestInit, input?: RequestInfo | URL) {
  const method = String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase()
  return method === 'POST'
}

function parseAgentBody(input: RequestInfo | URL, init?: RequestInit): AgentBody | null {
  if (!isPost(init, input) || pathOf(input) !== '/api/moni/agent-runtime' || typeof init?.body !== 'string') return null
  try { return JSON.parse(init.body) as AgentBody } catch { return null }
}

function classifyRawMaterialCardIntent(value: string) {
  const current = normalize(value)
  const rawContext = /(원재료|원료|부자재)/.test(current)
  const create = /(?:입고|매입).*(?:등록|기록|잡아|잡아줘|입력|작성|처리|반영|해줘|해주세요|해 줘)|(?:등록|기록|입력|작성).*(?:입고|매입)|(?:입고)\s*(?:해줘|해주세요|해 줘)/.test(current)
  const update = /(?:수정|변경|정정|고쳐|바꿔)/.test(current)
  const remove = /(?:삭제|지워|제거|없애)/.test(current)
  if (rawContext && remove) return 'DELETE' as const
  if (rawContext && update) return 'UPDATE' as const
  if ((rawContext || /입고/.test(current)) && create) return 'CREATE' as const
  return null
}

function expectedStoredUserText(body: AgentBody) {
  const message = normalize(body.message) || '첨부한 사진을 확인해줘.'
  const attachmentCount = Array.isArray(body.attachment_ids) ? body.attachment_ids.length : 0
  return normalize([message, attachmentCount ? `📷 사진 ${attachmentCount}장 첨부` : ''].filter(Boolean).join('\n\n'))
}

function syntheticSuccess(text: string, threadId: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, text, thread_id: threadId, recovered_background_turn: true, ...extra }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function friendlyRecoveryFailure(threadId: string) {
  return new Response(JSON.stringify({
    ok: false,
    thread_id: threadId,
    code: 'MONI_BACKGROUND_RECOVERY_PENDING',
    error: '화면을 다시 열었습니다. 서버 작업 결과를 아직 확인 중입니다. 잠시 후 이 대화에서 자동으로 이어집니다.',
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function completedAssistant(messages: StoredMessage[], expectedUser: string) {
  let userIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const row = messages[index]
    if (row?.role === 'user' && normalize(row.content) === expectedUser) {
      userIndex = index
      break
    }
  }
  if (userIndex < 0) return ''
  for (let index = userIndex + 1; index < messages.length; index += 1) {
    const row = messages[index]
    if (row?.role === 'assistant' && normalize(row.content)) return String(row.content || '').trim()
  }
  return ''
}

async function ensureThreadId(originalFetch: typeof window.fetch, body: AgentBody) {
  const existing = normalize(body.thread_id) || normalize(window.localStorage.getItem(THREAD_KEY))
  const response = await originalFetch('/api/moni/mobile-thread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread_id: existing || undefined, page: body.page || {} }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; thread_id?: string }
  if (!response.ok || !payload.ok || !payload.thread_id) throw new Error(payload.error || 'MONI 대화방을 준비하지 못했습니다.')
  window.localStorage.setItem(THREAD_KEY, payload.thread_id)
  return payload.thread_id
}

async function loadThreadMessages(originalFetch: typeof window.fetch, threadId: string) {
  const response = await originalFetch(`/api/moni/agent-runtime?thread_id=${encodeURIComponent(threadId)}&_=${Date.now()}`, { cache: 'no-store' })
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; messages?: StoredMessage[] }
  if (!response.ok || !payload.ok) return [] as StoredMessage[]
  return Array.isArray(payload.messages) ? payload.messages : []
}

async function matchingActionCard(originalFetch: typeof window.fetch, threadId: string, expectedUser: string) {
  try {
    const [cardResponse, messages] = await Promise.all([
      originalFetch(`/api/moni/mobile-actions?thread_id=${encodeURIComponent(threadId)}&_=${Date.now()}`, { cache: 'no-store' }),
      loadThreadMessages(originalFetch, threadId),
    ])
    const cardPayload = await cardResponse.json().catch(() => ({})) as { ok?: boolean; card?: { stage?: string; operation?: string } | null }
    const latestUser = [...messages].reverse().find((row) => row?.role === 'user')
    if (!cardResponse.ok || !cardPayload.ok || !cardPayload.card) return null
    if (normalize(latestUser?.content) !== expectedUser) return null
    if (!['draft', 'confirmation', 'completed'].includes(String(cardPayload.card.stage || ''))) return null
    return cardPayload.card
  } catch {
    return null
  }
}

async function recoverFinishedTurn(originalFetch: typeof window.fetch, threadId: string, expectedUser: string) {
  const deadline = Date.now() + RECOVERY_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const messages = await loadThreadMessages(originalFetch, threadId)
      const answer = completedAssistant(messages, expectedUser)
      if (answer) return syntheticSuccess(answer, threadId)

      const statusResponse = await originalFetch(`/api/moni/agent-status?thread_id=${encodeURIComponent(threadId)}&_=${Date.now()}`, { cache: 'no-store' })
      const statusPayload = await statusResponse.json().catch(() => ({})) as { ok?: boolean; run_status?: string }
      if (statusResponse.ok && statusPayload.ok && statusPayload.run_status && statusPayload.run_status !== 'RUNNING') {
        const secondRead = await loadThreadMessages(originalFetch, threadId)
        const secondAnswer = completedAssistant(secondRead, expectedUser)
        if (secondAnswer) return syntheticSuccess(secondAnswer, threadId)
      }
    } catch {
      // Mobile browsers may pause networking while backgrounded. Retry when execution resumes.
    }
    await new Promise((resolve) => window.setTimeout(resolve, RECOVERY_POLL_MS))
  }
  return friendlyRecoveryFailure(threadId)
}

function cardReadyText(operation: string) {
  if (operation === 'UPDATE') return '원재료 입고 수정 카드를 열었습니다. 카드 입력을 완료하면 다음 확인 단계로 이어집니다.'
  if (operation === 'DELETE') return '원재료 입고 삭제 카드를 열었습니다. 삭제할 기록을 선택하면 다음 확인 단계로 이어집니다.'
  return '원재료 입고 입력 카드를 열었습니다. 카드 입력을 완료하면 다음 확인 단계로 이어집니다.'
}

export default function MoniMobileContinuityGuard() {
  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window)

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const parsed = parseAgentBody(input, init)
      if (!parsed) return originalFetch(input, init)

      let threadId = normalize(parsed.thread_id)
      try {
        threadId = await ensureThreadId(originalFetch, parsed)
      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : 'MONI 대화방을 준비하지 못했습니다.',
        }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
      }

      const body: AgentBody = { ...parsed, thread_id: threadId }
      const expectedUser = expectedStoredUserText(body)
      const operation = classifyRawMaterialCardIntent(normalize(body.message))
      const attachmentCount = Array.isArray(body.attachment_ids) ? body.attachment_ids.length : 0

      if (operation && attachmentCount === 0) {
        return originalFetch('/api/moni/mobile-action-start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        })
      }

      const requestInit: RequestInit = {
        ...init,
        body: JSON.stringify(body),
        keepalive: true,
      }

      const actual = originalFetch(input, requestInit)
        .then((response) => ({ type: 'response' as const, response }))
        .catch((error) => ({ type: 'error' as const, error }))

      if (operation && attachmentCount > 0) {
        const cardRace = (async () => {
          const deadline = Date.now() + 25_000
          while (Date.now() < deadline) {
            const card = await matchingActionCard(originalFetch, threadId, expectedUser)
            if (card) return syntheticSuccess(cardReadyText(String(card.operation || operation)), threadId, { structured_action_card: true, operation: card.operation || operation })
            await new Promise((resolve) => window.setTimeout(resolve, 320))
          }
          return null
        })()

        const first = await Promise.race([
          actual,
          cardRace.then((response) => response ? ({ type: 'card' as const, response }) : ({ type: 'none' as const })),
        ])

        if (first.type === 'card') {
          void actual.then(() => undefined)
          return first.response
        }
        if (first.type === 'response') return first.response
        if (first.type === 'error') return recoverFinishedTurn(originalFetch, threadId, expectedUser)
        const settled = await actual
        if (settled.type === 'response') return settled.response
        return recoverFinishedTurn(originalFetch, threadId, expectedUser)
      }

      const settled = await actual
      if (settled.type === 'response') return settled.response
      return recoverFinishedTurn(originalFetch, threadId, expectedUser)
    }

    window.fetch = wrappedFetch
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch
    }
  }, [])

  return null
}
