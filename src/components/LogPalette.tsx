'use client'

import type { LogEntry } from '@/types'

interface LogPaletteProps {
  logs: LogEntry[]
}

// 로그 아이콘 반환
function getLogIcon(type: LogEntry['type']): string {
  switch (type) {
    case 'income': return '✓'
    case 'expense': return '✓'
    case 'inventory': return '📦'
    case 'excel': return '📊'
    case 'word': return '📄'
  }
}

// 로그 뱃지 색상
function getBadgeClass(type: LogEntry['type']): string {
  switch (type) {
    case 'income': return 'bg-emerald-900/50 text-emerald-400 border-emerald-700'
    case 'expense': return 'bg-red-900/50 text-red-400 border-red-700'
    case 'inventory': return 'bg-blue-900/50 text-blue-400 border-blue-700'
    case 'excel': return 'bg-green-900/50 text-green-400 border-green-700'
    case 'word': return 'bg-indigo-900/50 text-indigo-400 border-indigo-700'
  }
}

// 레이블
function getLabel(type: LogEntry['type']): string {
  switch (type) {
    case 'income': return '매출 저장'
    case 'expense': return '매입 저장'
    case 'inventory': return '재고 저장'
    case 'excel': return '엑셀 생성'
    case 'word': return '워드 생성'
  }
}

// 상대 시간 표시
function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 10) return '방금 전'
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

export default function LogPalette({ logs }: LogPaletteProps) {
  if (logs.length === 0) return null

  // 최근 3개만 표시
  const recent = logs.slice(-3).reverse()

  return (
    <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto scrollbar-none">
      {recent.map((log) => (
        <div
          key={log.id}
          className={`
            flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs
            animate-slideInLeft ${getBadgeClass(log.type)}
          `}
        >
          <span className="font-bold">{getLogIcon(log.type)} {getLabel(log.type)}</span>
          <span className="opacity-70">·</span>
          <span className="truncate max-w-[120px]">{log.description}</span>
          {log.amount !== undefined && (
            <>
              <span className="opacity-70">·</span>
              <span>{log.amount.toLocaleString('ko-KR')}원</span>
            </>
          )}
          <span className="opacity-70">·</span>
          <span className="whitespace-nowrap">{timeAgo(log.timestamp)}</span>
        </div>
      ))}
    </div>
  )
}
