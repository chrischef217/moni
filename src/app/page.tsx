'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type MainMenuKey = 'production' | 'accounting' | 'sales' | 'admin'
type SalesSubMenuKey = 'order' | 'revenue' | 'allowance'
type Role = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: Role
  content: string
  timestamp: Date
}

type Conversation = {
  id: string
  title: string
  createdAt: Date
  messages: ChatMessage[]
}

const MAIN_MENU: Array<{ key: MainMenuKey; label: string }> = [
  { key: 'production', label: '생산관리' },
  { key: 'accounting', label: '회계관리' },
  { key: 'sales', label: '영업관리' },
  { key: 'admin', label: '관리자' },
]

const SALES_SUB_MENU: Array<{ key: SalesSubMenuKey; label: string }> = [
  { key: 'order', label: '주문관리' },
  { key: 'revenue', label: '매출관리' },
  { key: 'allowance', label: '수당지급 관리' },
]

const EXAMPLES = [
  '오늘 떡볶이소스 200개 팔았어, 개당 3500원',
  '밀가루 50kg 들어왔어, 80000원 줬어',
  '이번 달 손익 얼마야?',
  '엑셀로 뽑아줘',
]

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function titleFromMessage(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return '새 대화'
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}...` : trimmed
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function assistantReply(input: string, menu: MainMenuKey, sub: SalesSubMenuKey) {
  if (menu === 'sales' && sub === 'allowance') {
    return '수당지급 관리는 Moni 내부 경로에서 처리하도록 바꿨습니다. 상단 메뉴의 "수당지급 관리"를 눌러 이동해 주세요.'
  }

  if (menu === 'production') return '생산관리 메뉴입니다. 요청하신 기능 버튼은 임시 상태로 배치해 두었습니다.'
  if (menu === 'accounting') return '회계관리 메뉴입니다. 필요한 기능을 순서대로 붙이겠습니다.'
  if (menu === 'admin') return '관리자 메뉴입니다. 권한/설정 기능을 여기에 확장할 수 있습니다.'
  return `${input} 요청을 확인했어요. 계속 진행할 내용을 입력해 주세요.`
}

function buttonClass(active: boolean) {
  return active
    ? 'bg-[#10b981] text-white border-[#10b981]'
    : 'bg-transparent text-[#cbd5e1] border-[#334155] hover:bg-[#1e293b]'
}

export default function HomePage() {
  const router = useRouter()
  const [mainMenu, setMainMenu] = useState<MainMenuKey>('sales')
  const [salesSubMenu, setSalesSubMenu] = useState<SalesSubMenuKey>('allowance')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [composer, setComposer] = useState('')

  const activeConversation = useMemo(
    () => conversations.find((conv) => conv.id === activeConvId) ?? null,
    [activeConvId, conversations],
  )

  const messages = activeConversation?.messages ?? []

  const pushMessage = (text: string) => {
    const userMessage: ChatMessage = { id: uid(), role: 'user', content: text, timestamp: new Date() }
    const aiMessage: ChatMessage = {
      id: uid(),
      role: 'assistant',
      content: assistantReply(text, mainMenu, salesSubMenu),
      timestamp: new Date(),
    }
    const nextMessages = [...messages, userMessage, aiMessage]

    if (activeConvId) {
      setConversations((prev) =>
        prev.map((conv) => (conv.id === activeConvId ? { ...conv, messages: nextMessages } : conv)),
      )
      return
    }

    const convId = uid()
    setConversations((prev) => [
      { id: convId, title: titleFromMessage(text), createdAt: new Date(), messages: nextMessages },
      ...prev,
    ])
    setActiveConvId(convId)
  }

  const submitMessage = () => {
    const text = composer.trim()
    if (!text) return
    pushMessage(text)
    setComposer('')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0b1220] text-[#e2e8f0]">
      <aside className="hidden w-[320px] flex-col border-r border-[#1e293b] bg-[#0f172a] lg:flex">
        <div className="border-b border-[#1e293b] px-6 py-7">
          <p className="text-[40px] font-extrabold leading-none text-[#10b981]">Moni</p>
          <p className="mt-2 text-sm text-[#64748b]">경영 고민? 모니한테 물어봐</p>
        </div>

        <div className="p-5">
          <button
            type="button"
            onClick={() => setActiveConvId(null)}
            className="w-full rounded-xl bg-[#10b981] px-4 py-3 text-left text-2xl font-bold text-white hover:bg-[#059669]"
          >
            + 새 대화
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {conversations.length === 0 ? (
            <p className="pt-10 text-center text-[30px] text-[#64748b]">아직 대화 기록이 없어요.</p>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setActiveConvId(conv.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                    conv.id === activeConvId
                      ? 'border-[#334155] bg-[#1e293b] text-white'
                      : 'border-transparent bg-transparent text-[#94a3b8] hover:bg-[#1e293b]'
                  }`}
                >
                  {conv.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#1e293b] p-5">
          <p className="text-sm text-[#94a3b8]">○○식품</p>
          <p className="text-xs text-[#64748b]">기본 사업장</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-[#0b1220]">
        <header className="border-b border-[#1e293b] bg-[#0f172a] px-4 py-3 lg:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {MAIN_MENU.map((menu) => (
              <button
                key={menu.key}
                type="button"
                onClick={() => {
                  setMainMenu(menu.key)
                  if (menu.key !== 'sales') setSalesSubMenu('order')
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${buttonClass(mainMenu === menu.key)}`}
              >
                {menu.label}
              </button>
            ))}
          </div>

          {mainMenu === 'sales' ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {SALES_SUB_MENU.map((submenu) => (
                <button
                  key={submenu.key}
                  type="button"
                  onClick={() => setSalesSubMenu(submenu.key)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${buttonClass(salesSubMenu === submenu.key)}`}
                >
                  {submenu.label}
                </button>
              ))}
              {salesSubMenu === 'allowance' ? (
                <button
                  type="button"
                  onClick={() => router.push('/allowance')}
                  className="rounded-lg border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#1e40af]"
                >
                  수당지급 관리 열기
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        <section className="flex-1 overflow-y-auto px-4 py-6 lg:px-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#10b981]/20">
                <span className="text-4xl font-bold text-[#10b981]">M</span>
              </div>
              <h2 className="mt-5 text-4xl font-bold text-white">안녕하세요! 모니입니다 🌿</h2>
              <p className="mt-2 text-2xl text-[#94a3b8]">경영 고민? 모니한테 물어봐!</p>

              <div className="mt-7 grid w-full max-w-3xl gap-2 sm:grid-cols-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => pushMessage(example)}
                    className="rounded-xl border border-[#334155] bg-[#1e293b] px-4 py-3 text-left text-xl text-[#cbd5e1] hover:border-[#10b981]"
                  >
                    💬 {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-5xl space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[84%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-[#10b981] text-white'
                        : 'border border-[#334155] bg-[#111827] text-[#e2e8f0]'
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-xl">{message.content}</p>
                    <p className="mt-2 text-right text-xs opacity-70">{formatTime(message.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="border-t border-[#1e293b] bg-[#0f172a] px-4 py-4 lg:px-6">
          <div className="mx-auto flex w-full max-w-5xl items-end gap-3 rounded-2xl border border-[#334155] bg-[#1e293b] px-4 py-3">
            <textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submitMessage()
                }
              }}
              rows={1}
              placeholder="모니에게 물어보세요... 예) 오늘 매출 50만원이야"
              className="max-h-40 min-h-[26px] flex-1 resize-none bg-transparent text-base text-white outline-none placeholder:text-[#64748b]"
            />
            <button
              type="button"
              onClick={submitMessage}
              className="rounded-lg bg-[#10b981] px-4 py-2 text-sm font-semibold text-white hover:bg-[#059669]"
            >
              전송
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-[#64748b]">Enter로 전송 · Shift+Enter로 줄바꿈</p>
        </footer>
      </main>
    </div>
  )
}
