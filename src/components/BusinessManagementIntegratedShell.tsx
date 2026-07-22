'use client'

import { useEffect, useRef } from 'react'
import BusinessManagementModule from '@/components/BusinessManagementModule'
import SalesManagementModule from '@/components/SalesManagementModule'

type MainTab = 'hr' | 'sales' | 'accounting' | 'salesManagement'

type Props = {
  initialTab: MainTab
  initialView: string
}

function exactText(element: Element) {
  return (element.textContent || '').replace(/\s+/g, ' ').trim()
}

export default function BusinessManagementIntegratedShell({ initialTab, initialView }: Props) {
  const appliedRef = useRef(false)

  useEffect(() => {
    appliedRef.current = false
    let attempts = 0

    const applyView = () => {
      attempts += 1
      const shell = document.querySelector<HTMLElement>('[data-business-management-shell]')
      if (!shell) return

      const ownAside = shell.querySelector<HTMLElement>('main > div > aside')
      if (ownAside) ownAside.style.display = 'none'

      if (initialTab === 'salesManagement') {
        appliedRef.current = true
        return
      }

      if (appliedRef.current) return

      if (initialTab === 'sales') {
        const label = initialView === 'pipeline'
          ? '영업 파이프라인'
          : initialView === 'activities'
            ? '영업활동·상담기록'
            : '고객사'
        const target = Array.from(shell.querySelectorAll<HTMLButtonElement>('button'))
          .find((button) => exactText(button) === label)
        if (target) {
          target.click()
          appliedRef.current = true
        }
        return
      }

      const headingLabel = initialTab === 'accounting'
        ? initialView === 'work-logs'
          ? '생산 프리랜서 근무보정'
          : '프리랜서 월별 정산'
        : '프리랜서 인력관리'

      const heading = Array.from(shell.querySelectorAll<HTMLElement>('h2'))
        .find((element) => exactText(element) === headingLabel)
      if (heading) {
        window.setTimeout(() => heading.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
        appliedRef.current = true
      }
    }

    applyView()
    const timer = window.setInterval(() => {
      applyView()
      if (appliedRef.current || attempts > 20) window.clearInterval(timer)
    }, 120)

    return () => window.clearInterval(timer)
  }, [initialTab, initialView])

  return (
    <div
      data-business-management-shell
      data-sales-management-shell={initialTab === 'salesManagement' ? 'true' : undefined}
    >
      {initialTab === 'salesManagement'
        ? <SalesManagementModule key={`sales-management-${initialView}`} initialView={initialView} />
        : <BusinessManagementModule key={`${initialTab}-${initialView}`} initialTab={initialTab} />}
      <style jsx global>{`
        [data-business-management-shell] main > div > aside {
          display: none !important;
        }

        [data-business-management-shell] main > div {
          max-width: none !important;
        }

        [data-business-management-shell] main > div > section {
          width: 100%;
          min-width: 0;
        }

        [data-sales-management-shell='true'] main header > div.mt-5 {
          display: none !important;
        }
      `}</style>
    </div>
  )
}
