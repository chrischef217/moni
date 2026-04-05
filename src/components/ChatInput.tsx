'use client'

import { useState, useRef, KeyboardEvent } from 'react'

interface ChatInputProps {
  onSend: (message: string, file?: File) => void
  disabled?: boolean
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 전송 처리
  const handleSend = () => {
    const text = input.trim()
    if (!text && !attachedFile) return
    if (disabled) return

    onSend(text, attachedFile ?? undefined)
    setInput('')
    setAttachedFile(null)

    // 높이 초기화
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  // Enter 키 전송 (Shift+Enter는 줄바꿈)
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 텍스트 영역 자동 높이 조정
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    }
  }

  return (
    <div className="p-4 border-t border-bg-tertiary bg-bg-primary">
      {/* 첨부 파일 표시 */}
      {attachedFile && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-bg-tertiary rounded-lg text-sm text-text-secondary">
          <span>📎</span>
          <span className="truncate flex-1">{attachedFile.name}</span>
          <button
            onClick={() => setAttachedFile(null)}
            className="text-text-muted hover:text-text-primary"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 bg-bg-tertiary rounded-xl px-3 py-2">
        {/* 파일 첨부 버튼 */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="text-text-muted hover:text-text-secondary transition-colors p-1 flex-shrink-0 mb-1"
          title="파일 첨부"
        >
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => setAttachedFile(e.target.files?.[0] ?? null)}
        />

        {/* 텍스트 입력창 */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="모니에게 물어보세요... 예) 오늘 매출 50만원이야"
          className="
            flex-1 bg-transparent text-text-primary placeholder-text-muted
            resize-none outline-none text-sm leading-6
            min-h-[24px] max-h-[160px]
            disabled:opacity-50
          "
        />

        {/* 전송 버튼 */}
        <button
          onClick={handleSend}
          disabled={disabled || (!input.trim() && !attachedFile)}
          className="
            flex-shrink-0 w-8 h-8 rounded-lg mb-0.5
            bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed
            flex items-center justify-center transition-colors duration-200
          "
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <p className="text-center text-text-muted text-xs mt-2">
        Enter로 전송 · Shift+Enter로 줄바꿈
      </p>
    </div>
  )
}
