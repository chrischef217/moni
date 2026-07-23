from pathlib import Path

path = Path('src/app/monthly-production-plan/page.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace(
    "import { useCallback, useEffect, useMemo, useState } from 'react'",
    "import { useCallback, useEffect, useMemo, useRef, useState } from 'react'",
    1,
)

priority_block = """function eventPriority(event: CalendarEvent) {
  if (event.source === 'actual') return event.actual_state === 'completed' ? 0 : 1
  if (event.source === 'user') return 2
  return 3
}
"""
helper_block = priority_block + """
function calendarEventClasses(event: CalendarEvent) {
  if (event.source === 'user') {
    return {
      card: 'border-blue-500 bg-blue-500/10 text-blue-100',
      marker: 'border-blue-500 bg-blue-500/20',
    }
  }
  if (event.source === 'ai') {
    return {
      card: 'border-dashed border-green-500 bg-green-500/10 text-green-100',
      marker: 'border-dashed border-green-500 bg-green-500/20',
    }
  }
  if (event.actual_state === 'completed') {
    return {
      card: 'border-amber-400 bg-amber-400/20 text-amber-50',
      marker: 'border-amber-400 bg-amber-400/30',
    }
  }
  return {
    card: 'border-dashed border-amber-400 bg-amber-400/10 text-amber-100',
    marker: 'border-dashed border-amber-400 bg-amber-400/20',
  }
}
"""
if priority_block not in text:
    raise SystemExit('eventPriority block not found')
text = text.replace(priority_block, helper_block, 1)

state_line = "  const [saving, setSaving] = useState(false)\n"
state_replacement = state_line + "  const [expandedDate, setExpandedDate] = useState<string | null>(null)\n  const expansionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)\n"
if state_line not in text:
    raise SystemExit('saving state line not found')
text = text.replace(state_line, state_replacement, 1)

focus_effect = """  useEffect(() => {
    const refreshOnFocus = () => void load()
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [load])
"""
focus_replacement = focus_effect + """

  useEffect(() => {
    setExpandedDate(null)
  }, [month])

  useEffect(() => () => {
    if (expansionCloseTimerRef.current) clearTimeout(expansionCloseTimerRef.current)
  }, [])
"""
if focus_effect not in text:
    raise SystemExit('focus effect block not found')
text = text.replace(focus_effect, focus_replacement, 1)

basis_line = "  const requirementBasisColor = aiOnlyView ? 'text-green-300' : 'text-blue-300'\n"
basis_replacement = basis_line + """

  function cancelExpansionClose() {
    if (!expansionCloseTimerRef.current) return
    clearTimeout(expansionCloseTimerRef.current)
    expansionCloseTimerRef.current = null
  }

  function expandDate(date: string) {
    cancelExpansionClose()
    setExpandedDate(date)
  }

  function scheduleExpansionClose() {
    cancelExpansionClose()
    expansionCloseTimerRef.current = setTimeout(() => {
      setExpandedDate(null)
      expansionCloseTimerRef.current = null
    }, 110)
  }
"""
if basis_line not in text:
    raise SystemExit('requirement basis line not found')
text = text.replace(basis_line, basis_replacement, 1)

return_marker = "  return (\n    <main className=\"min-h-screen bg-[#071426] text-slate-100\">"
render_helper = """  function renderCalendarCard(event: CalendarEvent, expanded = false) {
    const actualEvent = event.source === 'actual' ? event : null
    const displayQuantity = actualEvent ? actualEvent.display_quantity_g : event.planned_quantity_g
    const classes = calendarEventClasses(event)

    return (
      <div
        key={event.id}
        className={`rounded-lg border px-2 py-1 text-xs ${expanded ? 'shadow-lg shadow-black/20' : ''} ${classes.card}`}
      >
        <div className="flex justify-between gap-1">
          <b className="truncate">{event.product_name}</b>
          <span className="shrink-0">{formatKg(displayQuantity)}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
          {event.source === 'user' ? (
            <>
              <span>예상 계획</span>
              <button type="button" onClick={() => openEdit(event)} className="underline">수정</button>
              <button type="button" onClick={() => void remove(event.id)} className="underline">삭제</button>
            </>
          ) : event.source === 'ai' ? (
            <>
              <span>[AI예측]</span>
              <button type="button" onClick={() => adoptAi(event)} className="underline">예상 계획으로 전환</button>
            </>
          ) : (
            <>
              <span className="font-bold">{actualEvent?.actual_state === 'completed' ? '생산완료' : '작업지시 등록'}</span>
              {actualEvent?.lot_number && <span className="truncate text-amber-200">{actualEvent.lot_number}</span>}
            </>
          )}
        </div>
      </div>
    )
  }

""" + return_marker
if return_marker not in text:
    raise SystemExit('return marker not found')
text = text.replace(return_marker, render_helper, 1)

calendar_start = '          <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/40">\n'
calendar_end = '          <section className="mt-5 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/50">\n'
start = text.find(calendar_start)
end = text.find(calendar_end, start)
if start < 0 or end < 0:
    raise SystemExit('calendar boundaries not found')

new_calendar = """          <div className="relative overflow-visible rounded-2xl border border-slate-700 bg-slate-900/40">
            <div className="grid grid-cols-7 rounded-t-2xl border-b border-slate-700 bg-slate-900/95 text-center text-sm font-bold text-slate-300">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
                <div key={day} className={`p-3 ${index === 0 ? 'text-red-400' : index === 6 ? 'text-blue-400' : ''}`}>{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 rounded-b-2xl">
              {monthDays(month).map((cell, cellIndex, calendarCells) => {
                const dayEvents = eventsByDate.get(cell.date) ?? []
                const visibleEvents = dayEvents.slice(0, 3)
                const hiddenEvents = dayEvents.slice(3)
                const isExpanded = expandedDate === cell.date && dayEvents.length > 0
                const columnIndex = cellIndex % 7
                const rowIndex = Math.floor(cellIndex / 7)
                const totalRows = calendarCells.length / 7
                const horizontalClass = columnIndex <= 1
                  ? 'left-0'
                  : columnIndex >= 5
                    ? 'right-0'
                    : 'left-1/2 -translate-x-1/2'
                const verticalClass = rowIndex >= totalRows - 2 ? 'bottom-0' : 'top-0'
                const transformOrigin = `${rowIndex >= totalRows - 2 ? 'bottom' : 'top'} ${columnIndex <= 1 ? 'left' : columnIndex >= 5 ? 'right' : 'center'}`

                return (
                  <div
                    key={cell.date}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => {
                      if (dayEvents.length > 0) expandDate(cell.date)
                    }}
                    onMouseLeave={scheduleExpansionClose}
                    onFocus={() => {
                      if (dayEvents.length > 0) expandDate(cell.date)
                    }}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleExpansionClose()
                    }}
                    onClick={() => {
                      const touchOnly = window.matchMedia('(hover: none)').matches
                      if (touchOnly && dayEvents.length > 0) {
                        setExpandedDate((current) => current === cell.date ? null : cell.date)
                        return
                      }
                      openCreate(cell.date)
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        if (dayEvents.length > 0) setExpandedDate((current) => current === cell.date ? null : cell.date)
                        else openCreate(cell.date)
                      }
                    }}
                    className={`group relative min-h-28 cursor-pointer border-b border-r border-slate-800 p-2 text-left align-top outline-none transition-colors duration-200 hover:bg-slate-800/50 focus-visible:ring-2 focus-visible:ring-blue-400 ${cell.current ? '' : 'opacity-35'}`}
                  >
                    <span className="text-sm font-bold">{Number(cell.date.slice(-2))}</span>
                    <div className="mt-2 space-y-1" onClick={(event) => event.stopPropagation()}>
                      {visibleEvents.map((event) => renderCalendarCard(event))}
                      {hiddenEvents.length > 0 && (
                        <div
                          className="flex min-h-4 flex-wrap items-center gap-1 pt-0.5"
                          aria-label={`${hiddenEvents.length}건의 추가 일정`}
                        >
                          {hiddenEvents.map((event) => {
                            const markerClass = calendarEventClasses(event).marker
                            return (
                              <span
                                key={`marker-${event.id}`}
                                aria-hidden="true"
                                className={`h-3 w-3 rounded-[3px] border shadow-sm shadow-black/20 ${markerClass}`}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {dayEvents.length > 0 && (
                      <div
                        onMouseEnter={cancelExpansionClose}
                        onMouseLeave={scheduleExpansionClose}
                        onClick={(event) => event.stopPropagation()}
                        style={{ transformOrigin }}
                        className={`absolute z-50 w-[300%] max-w-[720px] rounded-2xl border border-blue-400/70 bg-[#0a192d]/[0.98] p-3 shadow-2xl shadow-black/60 backdrop-blur-md transition-all duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${horizontalClass} ${verticalClass} ${isExpanded ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-[0.82] opacity-0'}`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-700/80 pb-2">
                          <div className="flex items-baseline gap-2">
                            <b className="text-lg text-white">{Number(cell.date.slice(-2))}일</b>
                            <span className="text-xs text-slate-400">전체 {dayEvents.length}건</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openCreate(cell.date)}
                            className="rounded-lg border border-blue-400/60 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-200 transition hover:bg-blue-500/20"
                          >
                            + 예상 계획 추가
                          </button>
                        </div>
                        <div className="max-h-[62vh] space-y-1.5 overflow-y-auto pr-1">
                          {dayEvents.map((event) => renderCalendarCard(event, true))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

"""
text = text[:start] + new_calendar + text[end:]
path.write_text(text, encoding='utf-8')
