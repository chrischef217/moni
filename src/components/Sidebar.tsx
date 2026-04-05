'use client'

import { useState } from 'react'
import type { Conversation } from '@/types'

interface SidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  isOpen: boolean
  onClose: () => void
}

// 대화 날짜 그룹 분류
function groupConversations(conversations: Conversation[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: { label: string; items: Conversation[] }[] = [
    { label: '오늘', items: [] },
    { label: '어제', items: [] },
    { label: '이번 주', items: [] },
    { label: '이전', items: [] },
  ]

  for (const conv of conversations) {
    const d = new Date(conv.createdAt)
    if (d >= today) groups[0].items.push(conv)
    else if (d >= yesterday) groups[1].items.push(conv)
    else if (d >= weekAgo) groups[2].items.push(conv)
    else groups[3].items.push(conv)
  }

  return groups.filter((g) => g.items.length > 0)
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  isOpen,
  onClose,
}: SidebarProps) {
  const groups = groupConversations(conversations)

  return (
    <>
      {/* 모바일 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-[260px] bg-bg-secondary flex flex-col z-30
          transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0 lg:z-auto
        `}
      >
        {/* 로고 영역 */}
        <div className="p-5 border-b border-bg-tertiary">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl font-bold text-accent">Moni</span>
            <span className="text-xl">🌿</span>
          </div>
          <p className="text-xs text-text-muted">경영 고민? 모니한테 물어봐</p>
        </div>

        {/* 새 대화 버튼 */}
        <div className="p-3">
          <button
            onClick={onNew}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg
              bg-accent hover:bg-accent-hover text-white font-medium
              transition-colors duration-200"
          >
            <span className="text-lg">+</span>
            <span>새 대화</span>
          </button>
        </div>

        {/* 대화 히스토리 */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {groups.length === 0 ? (
            <p className="text-text-muted text-sm text-center mt-8">
              아직 대화 기록이 없어요.<br />
              모니에게 먼저 말을 걸어보세요!
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-4">
                <p className="text-xs text-text-muted font-medium px-2 mb-1 mt-2">
                  {group.label}
                </p>
                {group.items.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => { onSelect(conv.id); onClose() }}
                    className={`
                      w-full text-left px-3 py-2 rounded-lg text-sm
                      transition-colors duration-150 truncate
                      ${activeId === conv.id
                        ? 'bg-bg-tertiary text-text-primary'
                        : 'text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary'
                      }
                    `}
                  >
                    {conv.title}
                  </button>
                ))}
              </div>
            ))
          )}
        </nav>

        {/* 하단 사업장명 */}
        <div className="p-4 border-t border-bg-tertiary">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
              <span className="text-accent text-sm font-bold">식</span>
            </div>
            <div>
              <p className="text-text-primary text-sm font-medium">○○식품</p>
              <p className="text-text-muted text-xs">기본 사업장</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
