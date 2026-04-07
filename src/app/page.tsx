'use client'

import { useState, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import ChatWindow from '@/components/ChatWindow'
import ChatInput from '@/components/ChatInput'
import LogPalette from '@/components/LogPalette'
import type { Message, Conversation, LogEntry } from '@/types'

// 고유 ID 생성
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// 대화 제목 생성 (첫 메시지 앞 20자)
function makeTitle(firstMessage: string): string {
  return firstMessage.length > 20
    ? firstMessage.slice(0, 20) + '...'
    : firstMessage
}

export default function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])

  // 현재 활성 대화의 메시지 히스토리 (Claude API 형식)
  const getApiMessages = () =>
    messages.map((m) => ({ role: m.role, content: m.content }))

  // 새 대화 시작
  const handleNewConversation = () => {
    setActiveConvId(null)
    setMessages([])
    setStreamingText('')
  }

  // 대화 선택
  const handleSelectConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id)
    if (conv) {
      setActiveConvId(id)
      setMessages(conv.messages)
    }
  }

  // 엑셀 다운로드
  const downloadExcel = async () => {
    const res = await fetch('/api/export/excel')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const now = new Date()
    a.download = `모니_손익정산_${now.getFullYear()}년${String(now.getMonth() + 1).padStart(2, '0')}월.xlsx`
    a.click()
    URL.revokeObjectURL(url)

    setLogs((prev) => [
      ...prev,
      {
        id: uid(),
        type: 'excel',
        description: `${now.getMonth() + 1}월 손익정산`,
        timestamp: new Date(),
      },
    ])
  }

  // 워드 다운로드
  const downloadWord = async () => {
    const res = await fetch('/api/export/word')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const now = new Date()
    a.download = `모니_경영보고서_${now.getFullYear()}년${String(now.getMonth() + 1).padStart(2, '0')}월.docx`
    a.click()
    URL.revokeObjectURL(url)

    setLogs((prev) => [
      ...prev,
      {
        id: uid(),
        type: 'word',
        description: `${now.getMonth() + 1}월 경영보고서`,
        timestamp: new Date(),
      },
    ])
  }

  // File → base64 변환 헬퍼
  const fileToBase64 = (file: File): Promise<{ base64: string; mediaType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve({ base64, mediaType: file.type })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  // 메시지 전송
  const handleSend = useCallback(
    async (text: string, file?: File) => {
      if ((!text.trim() && !file) || isStreaming) return

      const displayText = text.trim() || (file ? `📎 ${file.name}` : '')
      const userMsg: Message = {
        id: uid(),
        role: 'user',
        content: displayText,
        timestamp: new Date(),
      }

      const updatedMessages = [...messages, userMsg]
      setMessages(updatedMessages)
      setIsStreaming(true)
      setStreamingText('')

      try {
        // 이미지 첨부 시 base64 변환
        let imagePayload: { base64: string; mediaType: string } | undefined
        if (file && file.type.startsWith('image/')) {
          imagePayload = await fileToBase64(file)
        }

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            ...(imagePayload ? { image: imagePayload } : {}),
          }),
        })

        if (!res.ok || !res.body) {
          throw new Error('응답 오류')
        }

        // SSE 스트림 읽기
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let fullText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') break

            try {
              const parsed = JSON.parse(data)

              // 텍스트 청크
              if (parsed.text) {
                fullText += parsed.text
                setStreamingText(fullText)
              }

              // DB 저장 완료 — Log Palette 업데이트
              if (parsed.actions) {
                const { savedTransaction, savedInventory, savedRawInbound, savedRawOutbound, savedPkgInbound, savedPkgOutbound, savedProduction } = parsed.actions
                if (savedTransaction) {
                  setLogs((prev) => [
                    ...prev,
                    {
                      id: uid(),
                      type: savedTransaction.type === 'income' ? 'income' : 'expense',
                      description: savedTransaction.description,
                      amount: savedTransaction.amount,
                      timestamp: new Date(),
                    },
                  ])
                }
                if (savedInventory) {
                  setLogs((prev) => [
                    ...prev,
                    {
                      id: uid(),
                      type: 'inventory',
                      description: `${savedInventory.item_name} ${savedInventory.action === 'in' ? '입고' : '출고'}`,
                      timestamp: new Date(),
                    },
                  ])
                }
                if (savedRawInbound) {
                  setLogs((prev) => [...prev, { id: uid(), type: 'inventory', description: `원료 입고: ${(savedRawInbound as Record<string, unknown>).item_name} ${((savedRawInbound as Record<string, unknown>).quantity_g as number / 1000).toFixed(1)}kg`, timestamp: new Date() }])
                }
                if (savedRawOutbound) {
                  setLogs((prev) => [...prev, { id: uid(), type: 'inventory', description: `원료 출고: ${(savedRawOutbound as Record<string, unknown>).item_name}`, timestamp: new Date() }])
                }
                if (savedPkgInbound) {
                  setLogs((prev) => [...prev, { id: uid(), type: 'inventory', description: `포장재 입고: ${(savedPkgInbound as Record<string, unknown>).material_name} ${(savedPkgInbound as Record<string, unknown>).quantity}개`, timestamp: new Date() }])
                }
                if (savedPkgOutbound) {
                  setLogs((prev) => [...prev, { id: uid(), type: 'inventory', description: `포장재 출고: ${(savedPkgOutbound as Record<string, unknown>).material_name}`, timestamp: new Date() }])
                }
                if (savedProduction) {
                  setLogs((prev) => [...prev, { id: uid(), type: 'inventory', description: `생산실적: ${(savedProduction as Record<string, unknown>).product_name}`, timestamp: new Date() }])
                }
              }

              // 파일 내보내기 트리거
              if (parsed.export === 'excel') {
                await downloadExcel()
              } else if (parsed.export === 'word') {
                await downloadWord()
              }
            } catch {
              // JSON 파싱 실패 무시
            }
          }
        }

        // AI 응답 메시지 추가
        const aiMsg: Message = {
          id: uid(),
          role: 'assistant',
          content: fullText,
          timestamp: new Date(),
        }

        const finalMessages = [...updatedMessages, aiMsg]
        setMessages(finalMessages)

        // 대화 히스토리 저장/업데이트
        if (activeConvId) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeConvId ? { ...c, messages: finalMessages } : c
            )
          )
        } else {
          const newConv: Conversation = {
            id: uid(),
            title: makeTitle(text),
            createdAt: new Date(),
            messages: finalMessages,
          }
          setConversations((prev) => [newConv, ...prev])
          setActiveConvId(newConv.id)
        }
      } catch (err) {
        console.error('채팅 오류:', err)
        const errMsg: Message = {
          id: uid(),
          role: 'assistant',
          content: '죄송해요, 응답 중에 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errMsg])
      } finally {
        setIsStreaming(false)
        setStreamingText('')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, isStreaming, activeConvId]
  )

  return (
    <div className="flex h-screen bg-bg-primary text-text-primary overflow-hidden">
      {/* 사이드바 */}
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 메인 영역 */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 상단 헤더 (모바일) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-bg-tertiary bg-bg-secondary flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-text-secondary hover:text-text-primary p-1"
          >
            {/* 햄버거 아이콘 */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 6H21M3 12H21M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <span className="font-bold text-accent">Moni</span>
          <span className="text-text-muted text-xs">경영 고민? 모니한테 물어봐</span>
        </header>

        {/* Log Palette — 최근 작업 카드 */}
        <LogPalette logs={logs} />

        {/* 채팅 창 */}
        <ChatWindow
          messages={messages}
          isStreaming={isStreaming}
          streamingText={streamingText}
        />

        {/* 입력 바 */}
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </main>
    </div>
  )
}
