'use client'

import { useLayoutEffect } from 'react'

const THREAD_KEY = 'moni-global-agent-thread-v11'
const POLL_MS = 1200
const MAX_WAIT_MS = 4 * 60 * 1000

type AgentMessage = { role?: string; content?: string }
type RuntimePayload = { ok?: boolean; messages?: AgentMessage[] }
type BusyPayload = { ok?: boolean; code?: string; error?: string }
type StatusPayload = { ok?: boolean; run_status?: string | null }

function normalizeQuestion(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parsePost(input: RequestInfo | URL, init?: RequestInit) {
  const method = String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'POST' || typeof init?.body !== 'string') return null
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  let pathname = rawUrl
  try { pathname = new URL(rawUrl, window.location.href).pathname } catch { /* keep raw */ }
  if (pathname !== '/api/moni/agent-runtime') return null
  try {
    const body = JSON.parse(init.body) as { message?: unknown; thread_id?: unknown; attachment_ids?: unknown[] }
    return {
      question: normalizeQuestion(body.message) || (Array.isArray(body.attachment_ids) && body.attachment_ids.length ? '첨부한 사진을 확인해줘.' : ''),
      threadId: String(body.thread_id || '').trim(),
    }
  } catch {
    return null
  }
}

function lastUserIndex(messages: AgentMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return index
  }
  return -1
}

function completedAnswerAfterLatestUser(messages: AgentMessage[]) {
  const userIndex = lastUserIndex(messages)
  if (userIndex < 0) return ''
  for (let index = messages.length - 1; index > userIndex; index -= 1) {
    const message = messages[index]
    if (message?.role === 'assistant' && String(message.content || '').trim()) return String(message.content).trim()
  }
  return ''
}

function latestUserQuestion(messages: AgentMessage[]) {
  const index = lastUserIndex(messages)
  return index >= 0 ? normalizeQuestion(messages[index]?.content) : ''
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export default function MoniMobileBusyRecovery() {
  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window)

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const post = parsePost(input, init)
      if (!post) return originalFetch(input, init)

      const response = await originalFetch(input, init)
      if (response.status !== 409) return response

      let busy: BusyPayload = {}
      try { busy = await response.clone().json() as BusyPayload } catch { return response }
      if (busy.code !== 'MONI_BUSY' || !/이전 질문|답변 중|중복 등록/i.test(String(busy.error || ''))) return response

      const threadId = post.threadId || String(window.localStorage.getItem(THREAD_KEY) || '').trim()
      if (!threadId || !post.question) return response

      // Verify this is a retry of the exact request already running. Different questions must never be auto-submitted.
      let initialMessages: AgentMessage[] = []
      try {
        const runtimeResponse = await originalFetch(`/api/moni/agent-runtime?thread_id=${encodeURIComponent(threadId)}&_=${Date.now()}`, { cache: 'no-store' })
        const runtime = await runtimeResponse.json() as RuntimePayload
        if (!runtimeResponse.ok || !runtime.ok) return response
        initialMessages = Array.isArray(runtime.messages) ? runtime.messages : []
      } catch {
        return response
      }

      if (latestUserQuestion(initialMessages) !== post.question) return response

      const alreadyCompleted = completedAnswerAfterLatestUser(initialMessages)
      if (alreadyCompleted) {
        return new Response(JSON.stringify({ ok: true, text: alreadyCompleted, thread_id: threadId, recovered_active_run: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        })
      }

      const deadline = Date.now() + MAX_WAIT_MS
      while (Date.now() < deadline) {
        await wait(POLL_MS)
        try {
          const [statusResponse, runtimeResponse] = await Promise.all([
            originalFetch(`/api/moni/agent-status?thread_id=${encodeURIComponent(threadId)}&_=${Date.now()}`, { cache: 'no-store' }),
            originalFetch(`/api/moni/agent-runtime?thread_id=${encodeURIComponent(threadId)}&_=${Date.now()}`, { cache: 'no-store' }),
          ])
          const status = await statusResponse.json() as StatusPayload
          const runtime = await runtimeResponse.json() as RuntimePayload
          if (!runtimeResponse.ok || !runtime.ok) continue
          const messages = Array.isArray(runtime.messages) ? runtime.messages : []
          const answer = completedAnswerAfterLatestUser(messages)
          if (answer) {
            return new Response(JSON.stringify({ ok: true, text: answer, thread_id: threadId, recovered_active_run: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            })
          }
          if (statusResponse.ok && status.ok && status.run_status && status.run_status !== 'RUNNING') break
        } catch {
          // Temporary polling errors should not create a second business request.
        }
      }

      return response
    }

    window.fetch = wrappedFetch
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
