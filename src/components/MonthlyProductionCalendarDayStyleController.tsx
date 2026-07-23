'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

type HolidayPayload = {
  ok?: boolean
  holidays?: Record<string, string[]>
}

type CalendarCell = {
  date: string
  current: boolean
}

const REST_DAY_CLASSES = [
  'moni-calendar-saturday',
  'moni-calendar-sunday',
  'moni-calendar-holiday',
  'moni-calendar-today',
]

const DATE_CLASSES = [
  'moni-calendar-date-saturday',
  'moni-calendar-date-sunday',
  'moni-calendar-date-holiday',
]

function monthDays(month: string): CalendarCell[] {
  const first = new Date(`${month}-01T00:00:00Z`)
  const firstWeekday = first.getUTCDay()
  const next = new Date(first)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const dayCount = Math.round((next.getTime() - first.getTime()) / 86400000)
  const cells: CalendarCell[] = []

  for (let index = firstWeekday; index > 0; index -= 1) {
    const date = new Date(first)
    date.setUTCDate(date.getUTCDate() - index)
    cells.push({ date: date.toISOString().slice(0, 10), current: false })
  }

  for (let day = 1; day <= dayCount; day += 1) {
    cells.push({ date: `${month}-${String(day).padStart(2, '0')}`, current: true })
  }

  while (cells.length % 7) {
    const date = new Date(`${cells[cells.length - 1].date}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + 1)
    cells.push({ date: date.toISOString().slice(0, 10), current: false })
  }

  return cells
}

function koreaDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function findDisplayedMonth() {
  const headings = Array.from(document.querySelectorAll<HTMLElement>('b'))
  for (const heading of headings) {
    const match = heading.textContent?.trim().match(/^(20\d{2})년\s+(\d{1,2})월$/)
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}`
  }
  return null
}

function findCalendarGrid() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div.grid.grid-cols-7.rounded-b-2xl'))
  return candidates.find((candidate) => candidate.querySelectorAll(':scope > [role="button"]').length >= 28) ?? null
}

function findDateLabel(cell: HTMLElement) {
  return Array.from(cell.children).find((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'SPAN') ?? null
}

async function fetchHolidayYear(year: string) {
  const response = await fetch(`/api/moni/korean-holidays?year=${year}`, { cache: 'no-store' })
  const payload = (await response.json().catch(() => null)) as HolidayPayload | null
  if (!response.ok || !payload?.ok) return {}
  return payload.holidays ?? {}
}

export default function MonthlyProductionCalendarDayStyleController() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname !== '/monthly-production-plan') return

    let disposed = false
    let scheduleTimer: number | null = null
    let decorateSequence = 0
    const holidayCache = new Map<string, Record<string, string[]>>()

    const decorate = async (refresh = false) => {
      const sequence = ++decorateSequence
      const month = findDisplayedMonth()
      const grid = findCalendarGrid()
      if (!month || !grid) return

      const cells = Array.from(grid.querySelectorAll<HTMLElement>(':scope > [role="button"]'))
      const calendarCells = monthDays(month)
      if (cells.length !== calendarCells.length) return

      const years = Array.from(new Set(calendarCells.map((cell) => cell.date.slice(0, 4))))
      const holidayMaps = await Promise.all(
        years.map(async (year) => {
          if (!refresh && holidayCache.has(year)) return holidayCache.get(year) ?? {}
          const holidays = await fetchHolidayYear(year)
          holidayCache.set(year, holidays)
          return holidays
        }),
      )

      if (disposed || sequence !== decorateSequence) return

      const holidays = Object.assign({}, ...holidayMaps) as Record<string, string[]>
      const today = koreaDateValue()

      cells.forEach((cell, index) => {
        const calendarCell = calendarCells[index]
        const date = calendarCell.date
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
        const holidayNames = holidays[date] ?? []
        const holidayText = holidayNames.join(' · ')
        const isHoliday = holidayNames.length > 0
        const isSunday = weekday === 0
        const isSaturday = weekday === 6
        const isToday = date === today

        cell.dataset.moniCalendarDate = date
        cell.classList.remove(...REST_DAY_CLASSES)
        if (isHoliday) cell.classList.add('moni-calendar-holiday')
        else if (isSunday) cell.classList.add('moni-calendar-sunday')
        else if (isSaturday) cell.classList.add('moni-calendar-saturday')
        if (isToday) cell.classList.add('moni-calendar-today')

        const dateLabel = findDateLabel(cell)
        if (dateLabel) {
          dateLabel.classList.remove(...DATE_CLASSES)
          if (isHoliday) dateLabel.classList.add('moni-calendar-date-holiday')
          else if (isSunday) dateLabel.classList.add('moni-calendar-date-sunday')
          else if (isSaturday) dateLabel.classList.add('moni-calendar-date-saturday')
        }

        let holidayLabel = cell.querySelector<HTMLElement>(':scope > [data-moni-holiday-label]')
        if (isHoliday) {
          if (!holidayLabel) {
            holidayLabel = document.createElement('span')
            holidayLabel.dataset.moniHolidayLabel = 'true'
            cell.appendChild(holidayLabel)
          }
          if (holidayLabel.textContent !== holidayText) holidayLabel.textContent = holidayText
          if (holidayLabel.title !== holidayText) holidayLabel.title = holidayText
          const cellTitle = `${date} · ${holidayText}`
          if (cell.title !== cellTitle) cell.title = cellTitle
        } else {
          holidayLabel?.remove()
          if (cell.hasAttribute('title')) cell.removeAttribute('title')
        }
      })
    }

    const schedule = (refresh = false) => {
      if (scheduleTimer !== null) window.clearTimeout(scheduleTimer)
      scheduleTimer = window.setTimeout(() => {
        scheduleTimer = null
        void decorate(refresh)
      }, 120)
    }

    const observer = new MutationObserver(() => schedule(false))
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    const refreshOnFocus = () => schedule(true)
    window.addEventListener('focus', refreshOnFocus)
    schedule(true)

    return () => {
      disposed = true
      observer.disconnect()
      window.removeEventListener('focus', refreshOnFocus)
      if (scheduleTimer !== null) window.clearTimeout(scheduleTimer)
      document.querySelectorAll<HTMLElement>('[data-moni-calendar-date]').forEach((cell) => {
        cell.classList.remove(...REST_DAY_CLASSES)
        cell.removeAttribute('data-moni-calendar-date')
        cell.removeAttribute('title')
        cell.querySelector(':scope > [data-moni-holiday-label]')?.remove()
      })
    }
  }, [pathname])

  return null
}
