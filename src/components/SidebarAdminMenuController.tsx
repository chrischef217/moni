'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SidebarAdminMenuController() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function cancelClose() {
    if (!closeTimer.current) return
    clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  function scheduleClose() {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 180)
  }

  useEffect(() => {
    let adminButton: HTMLButtonElement | null = null
    let observer: MutationObserver | null = null

    const bind = () => {
      const next = document.querySelector<HTMLButtonElement>("[data-moni-global-sidebar] button[aria-label='관리자']")
      if (!next || next === adminButton) return
      if (adminButton) {
        adminButton.removeEventListener('click', handleClick, true)
        adminButton.removeEventListener('mouseenter', handleEnter)
        adminButton.removeEventListener('mouseleave', scheduleClose)
      }
      adminButton = next
      adminButton.addEventListener('click', handleClick, true)
      adminButton.addEventListener('mouseenter', handleEnter)
      adminButton.addEventListener('mouseleave', scheduleClose)
    }

    function handleClick(event: MouseEvent) {
      event.preventDefault()
      event.stopPropagation()
      cancelClose()
      setOpen((current) => !current)
    }

    function handleEnter() {
      cancelClose()
      setOpen(true)
    }

    bind()
    observer = new MutationObserver(bind)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer?.disconnect()
      cancelClose()
      if (adminButton) {
        adminButton.removeEventListener('click', handleClick, true)
        adminButton.removeEventListener('mouseenter', handleEnter)
        adminButton.removeEventListener('mouseleave', scheduleClose)
      }
    }
  }, [])

  function openLegacyAdmin() {
    window.sessionStorage.setItem('moni-pending-nav', JSON.stringify({
      category: 'admin',
      target: '관리자',
      label: '관리자',
      parentTarget: '관리자',
    }))
    setOpen(false)
    router.push('/?legacy=1')
  }

  if (!open) return null

  return (
    <div
      data-moni-admin-submenu
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      className="fixed bottom-[66px] left-3 z-[1105] hidden w-[240px] overflow-hidden rounded-2xl border border-slate-700/90 bg-[#091b31] p-2 text-sm text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.35)] lg:block"
    >
      <div className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">ADMIN SETTINGS</div>
      <button type="button" onClick={() => { setOpen(false); router.push('/settings/appearance?section=company') }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold text-slate-200 transition hover:bg-emerald-500/15 hover:text-emerald-200"><span>🏢</span><span>회사 기본 정보등록</span></button>
      <button type="button" onClick={() => { setOpen(false); router.push('/settings/appearance') }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white"><span>◫</span><span>화면·배경 설정</span></button>
      <button type="button" onClick={openLegacyAdmin} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white"><span>⚙</span><span>관리자 설정</span></button>
    </div>
  )
}
