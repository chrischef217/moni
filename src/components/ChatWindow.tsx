'use client'

import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Message } from '@/types'

interface ChatWindowProps {
  messages: Message[]
  isStreaming: boolean
  streamingText: string
}

// AI 응답에서 [ACTION:...] 블록 및 내보내기 태그 제거 (UI 표시용)
function cleanResponse(text: string): string {
  return text
    .replace(/\[ACTION:SAVE_TRANSACTION\][\s\S]*?\[\/ACTION\]/g, '')
    .replace(/\[ACTION:SAVE_INVENTORY\][\s\S]*?\[\/ACTION\]/g, '')
    .replace(/\[EXCEL_EXPORT\]/g, '')
    .replace(/\[WORD_EXPORT\]/g, '')
    .trim()
}

// 메시지 버블 컴포넌트
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const displayContent = isUser ? message.content : cleanResponse(message.content)

  return (
    <div className={`flex mb-4 animate-fadeUp ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* AI 아바타 */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
          <span className="text-accent text-sm font-bold">M</span>
        </div>
      )}

      <div
        className={`
          max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed
          ${isUser
            ? 'bg-user-bubble text-white rounded-br-sm'
            : 'bg-ai-bubble text-text-primary rounded-bl-sm border border-bg-tertiary'
          }
        `}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{displayContent}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              components={{
                // 표 스타일
                table: ({ children }) => (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-xs">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-bg-tertiary px-2 py-1 bg-bg-tertiary text-text-secondary font-medium">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-bg-tertiary px-2 py-1">{children}</td>
                ),
                // 코드 블록 숨김 (ACTION 블록은 이미 제거됨)
                code: ({ children }) => (
                  <code className="bg-bg-tertiary px-1 rounded text-xs text-accent">
                    {children}
                  </code>
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
          </div>
        )}

        {/* 타임스탬프 */}
        <p className={`text-xs mt-1 ${isUser ? 'text-white/60' : 'text-text-muted'}`}>
          {new Date(message.timestamp).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      {/* 사용자 아바타 */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center flex-shrink-0 ml-2 mt-1">
          <span className="text-text-secondary text-sm font-bold">나</span>
        </div>
      )}
    </div>
  )
}

export default function ChatWindow({ messages, isStreaming, streamingText }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // 새 메시지 도착 시 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      {/* 환영 메시지 */}
      {messages.length === 0 && !isStreaming && (
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mb-4">
            <span className="text-accent text-3xl font-bold">M</span>
          </div>
          <h2 className="text-text-primary text-xl font-bold mb-2">안녕하세요! 모니입니다 🌿</h2>
          <p className="text-text-secondary text-sm mb-6">경영 고민? 모니한테 물어봐!</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
            {[
              '오늘 떡볶이소스 200개 팔았어, 개당 3500원',
              '밀가루 50kg 들어왔어, 80000원 줬어',
              '이번 달 손익 얼마야?',
              '엑셀로 뽑아줘',
            ].map((example) => (
              <div
                key={example}
                className="px-3 py-2 bg-bg-secondary border border-bg-tertiary rounded-lg text-xs text-text-secondary text-left"
              >
                💬 {example}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 메시지 목록 */}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {/* 스트리밍 중인 AI 응답 */}
      {isStreaming && (
        <div className="flex mb-4 justify-start animate-fadeUp">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
            <span className="text-accent text-sm font-bold">M</span>
          </div>
          <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-sm text-sm leading-relaxed bg-ai-bubble text-text-primary border border-bg-tertiary">
            {streamingText ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{cleanResponse(streamingText)}</ReactMarkdown>
              </div>
            ) : null}
            {/* 커서 깜빡임 */}
            <span className="inline-block w-0.5 h-4 bg-accent animate-pulse ml-0.5 align-middle" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
