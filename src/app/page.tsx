'use client'

import { useMemo, useState } from 'react'

type MainMenuKey = 'ai-chat' | 'production' | 'accounting' | 'sales' | 'admin'
type ChatRole = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  timestamp: Date
}

type Conversation = {
  id: string
  title: string
  createdAt: Date
  messages: ChatMessage[]
}

type MenuConfig = {
  label: string
  subMenus: Array<{ key: string; label: string }>
}

const MENU_CONFIG: Record<MainMenuKey, MenuConfig> = {
  'ai-chat': {
    label: 'AI 채팅',
    subMenus: [{ key: 'chat-main', label: '기본 채팅' }],
  },
  production: {
    label: '생산관리',
    subMenus: [
      { key: 'prod-overview', label: '생산 개요' },
      { key: 'prod-work', label: '작업 지시' },
      { key: 'prod-quality', label: '품질 관리' },
    ],
  },
  accounting: {
    label: '회계관리',
    subMenus: [
      { key: 'acc-overview', label: '손익 요약' },
      { key: 'acc-voucher', label: '전표 관리' },
      { key: 'acc-tax', label: '세무 자료' },
    ],
  },
  sales: {
    label: '영업관리',
    subMenus: [
      { key: 'sales-order', label: '주문관리' },
      { key: 'sales-revenue', label: '매출관리' },
      { key: 'sales-allowance', label: '수당지급 관리' },
    ],
  },
  admin: {
    label: '관리자',
    subMenus: [
      { key: 'admin-user', label: '사용자 관리' },
      { key: 'admin-role', label: '권한 관리' },
      { key: 'admin-system', label: '환경 설정' },
    ],
  },
}

const CHAT_EXAMPLES = [
  '오늘 떡볶이소스 200개 팔았어, 개당 3500원',
  '밀가루 50kg 들어왔어, 80000원 줬어',
  '이번 달 손익 얼마야?',
  '엑셀로 뽑아줘',
]

const ALLOWANCE_TABS = [
  { key: 'freelancer', label: '프리랜서 관리' },
  { key: 'client-product', label: '거래처/제품 관리' },
  { key: 'pay', label: '수당 관리' },
  { key: 'settings', label: '관리자 설정' },
] as const

type AllowanceTabKey = (typeof ALLOWANCE_TABS)[number]['key']

const MODULE_CONTENT: Record<string, { title: string; description: string; actions: string[] }> = {
  'prod-overview': {
    title: '생산 개요',
    description: '오늘 생산 현황, 공정 상태, 이슈를 빠르게 확인하는 영역입니다.',
    actions: ['생산 현황 새로고침', '금일 이슈 확인', '공정 보고서 생성'],
  },
  'prod-work': {
    title: '작업 지시',
    description: '작업 지시서 생성/배포를 위한 임시 메뉴입니다.',
    actions: ['작업지시서 생성', '작업지시서 조회', '우선순위 변경'],
  },
  'prod-quality': {
    title: '품질 관리',
    description: '검사 항목/검사 결과를 관리하는 임시 메뉴입니다.',
    actions: ['검사 항목 등록', '검사 결과 입력', '품질 이슈 등록'],
  },
  'acc-overview': {
    title: '손익 요약',
    description: '월별 매출/비용/손익 요약을 확인하는 임시 메뉴입니다.',
    actions: ['당월 손익 조회', '전월 비교', 'PDF 보고서 생성'],
  },
  'acc-voucher': {
    title: '전표 관리',
    description: '매입/매출 전표를 등록/수정하는 임시 메뉴입니다.',
    actions: ['전표 등록', '전표 수정', '전표 삭제'],
  },
  'acc-tax': {
    title: '세무 자료',
    description: '세무 신고용 자료를 정리하는 임시 메뉴입니다.',
    actions: ['부가세 자료 준비', '원천세 자료 준비', '자료 내보내기'],
  },
  'sales-order': {
    title: '주문관리',
    description: '거래처 주문을 등록/조회하는 임시 메뉴입니다.',
    actions: ['주문 등록', '주문 조회', '납기 확인'],
  },
  'sales-revenue': {
    title: '매출관리',
    description: '매출 현황 및 미수금 상태를 확인하는 임시 메뉴입니다.',
    actions: ['매출 등록', '거래처별 매출 조회', '미수금 업데이트'],
  },
  'admin-user': {
    title: '사용자 관리',
    description: '사용자 계정 생성/수정/비활성화 임시 메뉴입니다.',
    actions: ['사용자 추가', '사용자 비밀번호 초기화', '사용자 비활성화'],
  },
  'admin-role': {
    title: '권한 관리',
    description: '역할별 접근 권한을 설정하는 임시 메뉴입니다.',
    actions: ['권한 템플릿 생성', '메뉴 권한 변경', '권한 감사 로그 확인'],
  },
  'admin-system': {
    title: '환경 설정',
    description: '시스템 공통 환경값을 설정하는 임시 메뉴입니다.',
    actions: ['회사 기본 정보 수정', '알림 설정 변경', '백업 스케줄 확인'],
  },
}

function uid() {
  return `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function titleFromMessage(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return '새 대화'
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}...` : trimmed
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function buildInitialSubMenuState() {
  return Object.keys(MENU_CONFIG).reduce((acc, key) => {
    const mainKey = key as MainMenuKey
    acc[mainKey] = MENU_CONFIG[mainKey].subMenus[0].key
    return acc
  }, {} as Record<MainMenuKey, string>)
}

function fakeAssistantReply(text: string, mainMenu: MainMenuKey, subMenu: string) {
  if (mainMenu === 'sales' && subMenu === 'sales-allowance') {
    return '수당지급 관리는 현재 화면 안에서 하단 콘텐츠만 전환되도록 구성했습니다. 상단 메뉴는 그대로 유지됩니다.'
  }

  if (mainMenu === 'production') return `생산관리(${subMenu}) 요청을 확인했어요. 다음 기능을 연결할 수 있습니다.`
  if (mainMenu === 'accounting') return `회계관리(${subMenu}) 요청을 확인했어요. 필요한 기능을 이어서 붙일게요.`
  if (mainMenu === 'sales') return `영업관리(${subMenu}) 요청을 확인했어요. 데이터를 연결해 드릴 수 있습니다.`
  if (mainMenu === 'admin') return `관리자(${subMenu}) 요청을 확인했어요. 설정 메뉴 확장 가능합니다.`
  return `${text} 요청을 확인했습니다. 이어서 작업을 진행할 내용을 입력해 주세요.`
}

function menuButtonClass(active: boolean) {
  return active
    ? 'border-[#10b981] bg-[#10b981] text-white'
    : 'border-[#334155] bg-transparent text-[#cbd5e1] hover:bg-[#1e293b]'
}

function actionButtonClass(active: boolean) {
  return active
    ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white'
    : 'border-[#334155] bg-[#111827] text-[#cbd5e1] hover:border-[#10b981]'
}

export default function HomePage() {
  const [mainMenu, setMainMenu] = useState<MainMenuKey>('ai-chat')
  const [subMenuByMain, setSubMenuByMain] = useState<Record<MainMenuKey, string>>(() => {
    return buildInitialSubMenuState()
  })

  const [allowanceTab, setAllowanceTab] = useState<AllowanceTabKey>('freelancer')
  const [moduleStatus, setModuleStatus] = useState('')

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [composer, setComposer] = useState('')

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  )

  const messages = activeConversation?.messages ?? []
  const currentSubMenu = subMenuByMain[mainMenu]
  const subMenus = MENU_CONFIG[mainMenu].subMenus

  const selectMainMenu = (menu: MainMenuKey) => {
    setMainMenu(menu)
    const hasSelectedSub = MENU_CONFIG[menu].subMenus.some((item) => item.key === subMenuByMain[menu])
    if (!hasSelectedSub) {
      setSubMenuByMain((prev) => ({ ...prev, [menu]: MENU_CONFIG[menu].subMenus[0].key }))
    }
    setModuleStatus('')
  }

  const selectSubMenu = (subKey: string) => {
    setSubMenuByMain((prev) => ({ ...prev, [mainMenu]: subKey }))
    setModuleStatus('')
    if (subKey === 'sales-allowance') setAllowanceTab('freelancer')
  }

  const resetConversation = () => {
    setActiveConversationId(null)
    setComposer('')
  }

  const pushChat = (text: string) => {
    const userMessage: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    const assistantMessage: ChatMessage = {
      id: uid(),
      role: 'assistant',
      content: fakeAssistantReply(text, mainMenu, currentSubMenu),
      timestamp: new Date(),
    }

    const nextMessages = [...messages, userMessage, assistantMessage]

    if (activeConversationId) {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === activeConversationId
            ? { ...conversation, messages: nextMessages }
            : conversation,
        ),
      )
      return
    }

    const newId = uid()
    setConversations((prev) => [
      {
        id: newId,
        title: titleFromMessage(text),
        createdAt: new Date(),
        messages: nextMessages,
      },
      ...prev,
    ])
    setActiveConversationId(newId)
  }

  const submitChat = () => {
    const text = composer.trim()
    if (!text) return
    pushChat(text)
    setComposer('')
  }

  const clickModuleAction = (label: string) => {
    setModuleStatus(`"${label}" 버튼을 실행했습니다. (임시 동작)`)
  }

  const renderModuleContent = () => {
    if (mainMenu === 'sales' && currentSubMenu === 'sales-allowance') {
      return (
        <div className="rounded-2xl border border-[#334155] bg-[#111827] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-white">수당지급 관리</h3>
              <p className="mt-1 text-sm text-[#94a3b8]">메뉴는 유지하고 하단 콘텐츠만 전환되는 통합 화면입니다.</p>
            </div>
            <button
              type="button"
              onClick={() => selectMainMenu('ai-chat')}
              className="rounded-lg border border-[#334155] px-3 py-2 text-sm font-semibold text-[#cbd5e1] hover:bg-[#1e293b]"
            >
              AI 채팅으로 이동
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {ALLOWANCE_TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setAllowanceTab(item.key)}
                className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${actionButtonClass(allowanceTab === item.key)}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-[#334155] bg-[#0f172a] p-4">
            {allowanceTab === 'freelancer' ? <p className="text-sm text-[#cbd5e1]">프리랜서 목록/등록/수정/삭제 영역입니다.</p> : null}
            {allowanceTab === 'client-product' ? <p className="text-sm text-[#cbd5e1]">거래처별 제품 목록 등록/수정/삭제 영역입니다.</p> : null}
            {allowanceTab === 'pay' ? <p className="text-sm text-[#cbd5e1]">월별 수당 등록/수정/삭제 및 정산서 미리보기 영역입니다.</p> : null}
            {allowanceTab === 'settings' ? <p className="text-sm text-[#cbd5e1]">회사정보/지급일/계정 설정 영역입니다.</p> : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => clickModuleAction('저장')}
              className="rounded-lg border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1e40af]"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => clickModuleAction('수정')}
              className="rounded-lg border border-[#334155] px-3 py-2 text-sm font-semibold text-[#cbd5e1] hover:bg-[#1e293b]"
            >
              수정
            </button>
            <button
              type="button"
              onClick={() => clickModuleAction('삭제')}
              className="rounded-lg border border-[#7f1d1d] px-3 py-2 text-sm font-semibold text-[#fca5a5] hover:bg-[#450a0a]"
            >
              삭제
            </button>
          </div>
        </div>
      )
    }

    const fallback = MODULE_CONTENT[currentSubMenu]
    if (!fallback) {
      return (
        <div className="rounded-2xl border border-[#334155] bg-[#111827] p-5 text-sm text-[#94a3b8]">
          준비 중인 메뉴입니다.
        </div>
      )
    }

    return (
      <div className="rounded-2xl border border-[#334155] bg-[#111827] p-5">
        <h3 className="text-xl font-semibold text-white">{fallback.title}</h3>
        <p className="mt-1 text-sm text-[#94a3b8]">{fallback.description}</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {fallback.actions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => clickModuleAction(action)}
              className="rounded-xl border border-[#334155] bg-[#0f172a] px-3 py-2 text-left text-sm font-semibold text-[#cbd5e1] transition hover:border-[#10b981]"
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#020617] text-[#e2e8f0]">
      <aside className="hidden w-[300px] flex-col border-r border-[#1e293b] bg-[#0f172a] lg:flex">
        <div className="border-b border-[#1e293b] px-5 py-6">
          <p className="text-5xl font-extrabold text-[#10b981]">Moni</p>
          <p className="mt-2 text-sm text-[#64748b]">경영 고민? 모니한테 물어봐</p>
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={() => {
              resetConversation()
              selectMainMenu('ai-chat')
            }}
            className="w-full rounded-xl bg-[#10b981] px-4 py-3 text-left text-4xl font-bold text-white hover:bg-[#059669]"
          >
            + 새 대화
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {conversations.length === 0 ? (
            <p className="pt-10 text-center text-2xl leading-snug text-[#64748b]">아직 대화 기록이 없어요.</p>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => {
                    setActiveConversationId(conversation.id)
                    selectMainMenu('ai-chat')
                  }}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    conversation.id === activeConversationId
                      ? 'border-[#334155] bg-[#1e293b] text-white'
                      : 'border-transparent text-[#94a3b8] hover:bg-[#1e293b]'
                  }`}
                >
                  {conversation.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#1e293b] p-4">
          <p className="text-sm text-[#94a3b8]">○○식품</p>
          <p className="text-xs text-[#64748b]">기본 사업장</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-[#020617]">
        <header className="border-b border-[#1e293b] bg-[#0b1220] px-4 py-3 lg:px-6">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MENU_CONFIG) as MainMenuKey[]).map((menuKey) => (
              <button
                key={menuKey}
                type="button"
                onClick={() => selectMainMenu(menuKey)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${menuButtonClass(mainMenu === menuKey)}`}
              >
                {MENU_CONFIG[menuKey].label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {subMenus.map((sub) => (
              <button
                key={sub.key}
                type="button"
                onClick={() => selectSubMenu(sub.key)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${menuButtonClass(currentSubMenu === sub.key)}`}
              >
                {sub.label}
              </button>
            ))}

            {mainMenu === 'sales' && currentSubMenu !== 'sales-allowance' ? (
              <button
                type="button"
                onClick={() => selectSubMenu('sales-allowance')}
                className="rounded-lg border border-[#1d4ed8] bg-[#1d4ed8] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#1e40af]"
              >
                수당지급 관리 열기
              </button>
            ) : null}
          </div>
        </header>

        <section className="flex-1 overflow-y-auto">
          {mainMenu === 'ai-chat' ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex-1 overflow-y-auto px-4 py-5 lg:px-6">
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#10b981]/20">
                      <span className="text-5xl font-bold text-[#10b981]">M</span>
                    </div>
                    <h2 className="mt-4 text-5xl font-bold text-white sm:text-6xl">안녕하세요! 모니입니다 🌿</h2>
                    <p className="mt-2 text-xl text-[#94a3b8] sm:text-2xl">경영 고민? 모니한테 물어봐!</p>

                    <div className="mt-6 grid w-full max-w-4xl gap-3 sm:grid-cols-2">
                      {CHAT_EXAMPLES.map((example) => (
                        <button
                          key={example}
                          type="button"
                          onClick={() => pushChat(example)}
                          className="rounded-xl border border-[#334155] bg-[#1e293b] px-4 py-3 text-left text-lg text-[#cbd5e1] transition hover:border-[#10b981]"
                        >
                          💬 {example}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-5xl space-y-4">
                    {messages.map((message) => (
                      <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[84%] rounded-2xl px-4 py-3 ${
                            message.role === 'user'
                              ? 'bg-[#10b981] text-white'
                              : 'border border-[#334155] bg-[#111827] text-[#e2e8f0]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-base leading-relaxed">{message.content}</p>
                          <p className="mt-2 text-right text-xs opacity-70">{formatTime(message.timestamp)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-[#1e293b] bg-[#0b1220] px-4 py-4 lg:px-6">
                <div className="mx-auto flex w-full max-w-5xl items-end gap-3 rounded-2xl border border-[#334155] bg-[#1e293b] px-4 py-3">
                  <textarea
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        submitChat()
                      }
                    }}
                    rows={1}
                    placeholder="모니에게 물어보세요... 예) 오늘 매출 50만원이야"
                    className="max-h-44 min-h-[26px] flex-1 resize-none bg-transparent text-base text-white outline-none placeholder:text-[#64748b]"
                  />
                  <button
                    type="button"
                    onClick={submitChat}
                    className="rounded-lg bg-[#10b981] px-4 py-2 text-sm font-semibold text-white hover:bg-[#059669]"
                  >
                    전송
                  </button>
                </div>
                <p className="mt-2 text-center text-xs text-[#64748b]">Enter로 전송 · Shift+Enter로 줄바꿈</p>
              </div>
            </div>
          ) : (
            <div className="p-4 lg:p-6">
              {renderModuleContent()}
              {moduleStatus ? (
                <div className="mt-3 rounded-lg border border-[#1e3a8a] bg-[#1e293b] px-4 py-3 text-sm text-[#bfdbfe]">{moduleStatus}</div>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
