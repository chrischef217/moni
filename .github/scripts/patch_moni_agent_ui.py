from pathlib import Path

path = Path('src/components/GlobalMoniAgent.tsx')
s = path.read_text(encoding='utf-8')

anchor = """function attachmentLabel(item: PendingAttachment) {
  if (item.status === 'uploading') return '업로드 중'
  if (item.status === 'failed') return '실패'
  return formatBytes(item.file.size)
}
"""
addition = anchor + """
function waitingMessages(question: string, hasAttachments: boolean) {
  const normalized = question.replace(/\\s+/g, ' ').trim()
  if (hasAttachments) return ['첨부한 자료를 안전하게 불러오고 있어요.', '자료의 표와 내용을 분석하고 있어요.', '질문과 자료를 함께 검토하고 있어요.']
  if (/(계산|금액|단가|공급가|합계|원가|수량|중량|매출|미수|미지급|잔액|재고)/.test(normalized)) return ['관련 데이터를 확인하고 있어요.', '지금 계산하고 있어요.', '계산 결과를 다시 검토하고 있어요.']
  if (/(문서|보고서|견적서|발주서|계약서|작성|정리|요약|엑셀|pdf)/i.test(normalized)) return ['요청 내용을 정리하고 있어요.', '지금 문서 구성을 작성하고 있어요.', '빠진 내용이 없는지 검토하고 있어요.']
  if (/(분석|검토|비교|원인|왜|문제|오류|이상|확인)/.test(normalized)) return ['관련 데이터를 확인하고 있어요.', '원인과 근거를 분석하고 있어요.', '답변이 정확한지 검토하고 있어요.']
  if (/(어디|위치|메뉴|링크|방법|사용법)/.test(normalized)) return ['정확한 메뉴와 기능을 찾고 있어요.', '현재 화면과 권한을 확인하고 있어요.', '가장 빠른 이동 방법을 정리하고 있어요.']
  return ['잠시만 기다려 주세요. 질문을 이해하고 있어요.', '최고의 답변을 위해 필요한 정보를 확인하고 있어요.', '답변이 정확한지 검토하고 있어요.']
}
"""
if anchor not in s:
    raise SystemExit('attachmentLabel anchor not found')
s = s.replace(anchor, addition, 1)

old = """  const [dragActive, setDragActive] = useState(false)
  const [bubble, setBubble] = useState('MONI에게 무엇이든 물어보세요.')
"""
new = """  const [dragActive, setDragActive] = useState(false)
  const [waitingSteps, setWaitingSteps] = useState<string[]>(['잠시만 기다려 주세요. 질문을 이해하고 있어요.'])
  const [waitingStep, setWaitingStep] = useState(0)
  const [bubble, setBubble] = useState('MONI에게 무엇이든 물어보세요.')
"""
if old not in s: raise SystemExit('state anchor not found')
s = s.replace(old, new, 1)

old = """  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  const hasConversation = messages.length > 0
"""
new = """  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  useEffect(() => {
    if (!sending) {
      setWaitingStep(0)
      return
    }
    const timer = window.setInterval(() => {
      setWaitingStep((current) => Math.min(current + 1, waitingSteps.length - 1))
    }, 3600)
    return () => window.clearInterval(timer)
  }, [sending, waitingSteps])

  const hasConversation = messages.length > 0
"""
if old not in s: raise SystemExit('effect anchor not found')
s = s.replace(old, new, 1)

old = """    setInput('')
    setError('')
    setSending(true)

    try {
"""
new = """    setInput('')
    setError('')
    setWaitingSteps(waitingMessages(visibleQuestion, readyAttachments.length > 0))
    setWaitingStep(0)
    setSending(true)

    try {
"""
if old not in s: raise SystemExit('send anchor not found')
s = s.replace(old, new, 1)

replacements = {
"border border-white/20 bg-[#0c1d33]/95 px-4 py-3 text-left text-sm font-bold leading-5 text-white shadow-[0_18px_55px_rgba(2,6,23,0.42)] backdrop-blur-xl":"border border-[#b8ddd5] bg-[#f8fffc]/95 px-4 py-3 text-left text-sm font-bold leading-5 text-[#173b52] shadow-[0_18px_55px_rgba(23,59,82,0.18)] backdrop-blur-lg",
"text-emerald-300\">MONI":"text-[#0f8f78]\">MONI",
"border-b border-r border-white/20 bg-[#0c1d33]":"border-b border-r border-[#b8ddd5] bg-[#f8fffc]",
"border border-white/20 bg-[#071426]/95 text-slate-100 shadow-[0_28px_90px_rgba(2,6,23,0.58)] backdrop-blur-2xl":"border border-[#bfded8] bg-[#f7fcfb]/98 text-[#173b52] shadow-[0_28px_90px_rgba(23,59,82,0.24)] backdrop-blur-xl",
"border-emerald-300/70 bg-[#071426]/90":"border-[#21b99a] bg-[#effbf7]/95",
"text-emerald-200":"text-[#087d69]",
"text-slate-400\">이미지":"text-[#607d8d]\">이미지",
"border-b border-white/10 px-4 py-4":"border-b border-[#d7e9e5] bg-white/85 px-4 py-4",
"font-black text-white\">MONI":"font-black text-[#173b52]\">MONI",
"text-blue-200\">READ ONLY":"text-[#1878a8]\">READ ONLY",
"text-slate-500\">대화":"text-[#607d8d]\">대화",
"text-slate-500 hover:bg-white/5 hover:text-slate-300":"text-[#607d8d] hover:bg-[#edf7f4] hover:text-[#173b52]",
"text-slate-400 hover:bg-white/5 hover:text-white":"text-[#607d8d] hover:bg-[#edf7f4] hover:text-[#173b52]",
"border-emerald-400/15 bg-emerald-400/[0.05]":"border-[#c7e7df] bg-[#edf9f5]",
"text-emerald-100\">질문":"text-[#087d69]\">질문",
"text-slate-500\">스크린샷":"text-[#526f7e]\">스크린샷",
"border border-white/10 bg-white/[0.025]":"border border-[#d8e8e4] bg-white",
"text-slate-300 transition hover:border-emerald-400/25 hover:bg-emerald-400/[0.05] hover:text-white":"text-[#274b5f] transition hover:border-[#64cbb5] hover:bg-[#edf9f5] hover:text-[#087d69]",
"text-violet-300 hover:text-violet-200":"text-[#6467b2] hover:text-[#464b98]",
"bg-blue-500/20 text-blue-50":"border border-[#b9d8ee] bg-[#e8f4ff] text-[#173b52]",
"border border-white/10 bg-white/[0.035] text-slate-200":"border border-[#d8e8e4] bg-white text-[#263f4d]",
"border-t border-white/10 pt-2 text-[11px] text-blue-200":"border-t border-[#c9deea] pt-2 text-[11px] text-[#37708f]",
"border-t border-white/10 bg-[#071426]/85 p-3":"border-t border-[#d7e9e5] bg-white/90 p-3",
"border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-[11px] text-red-200":"border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700",
"border-white/10 bg-white/[0.04]":"border-[#d8e8e4] bg-[#f7fbfa]",
"font-bold text-slate-200":"font-bold text-[#274b5f]",
"text-slate-500'}>{attachmentLabel":"text-[#6c8794]'}>{attachmentLabel",
"text-slate-500 hover:bg-white/10 hover:text-white":"text-[#6c8794] hover:bg-[#e8f4f0] hover:text-[#173b52]",
"rounded-2xl border border-white/15 bg-black/15 p-2 focus-within:border-emerald-400/35":"rounded-2xl border border-[#c9dfda] bg-[#f7fbfa] p-2 focus-within:border-[#21b99a] focus-within:ring-2 focus-within:ring-[#21b99a]/10",
"text-lg text-slate-400 hover:bg-white/[0.06] hover:text-white":"text-lg text-[#607d8d] hover:bg-[#e8f4f0] hover:text-[#087d69]",
"text-sm text-white outline-none placeholder:text-slate-600":"text-sm text-[#173b52] outline-none placeholder:text-[#8aa0aa]",
"text-[10px] text-slate-600":"text-[10px] text-[#78909d]",
}
for old, new in replacements.items():
    s = s.replace(old, new)

old_loader = """                {sending && <div className=\"mr-16 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-slate-400\"><span className=\"inline-flex items-center gap-1.5\"><i className=\"h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300\" /><i className=\"h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 [animation-delay:120ms]\" /><i className=\"h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 [animation-delay:240ms]\" />MONI가 현재 데이터와 첨부자료를 확인하고 있습니다.</span></div>}
"""
new_loader = """                {sending && (
                  <div className=\"mr-8 rounded-2xl border border-[#cfe5df] bg-white px-4 py-3 text-sm text-[#385968] shadow-[0_8px_24px_rgba(23,59,82,0.07)]\" role=\"status\" aria-live=\"polite\">
                    <div className=\"flex items-center gap-3\">
                      <span className=\"moni-thinking-dots inline-flex h-6 items-center gap-1.5\" aria-hidden=\"true\"><i /><i /><i /></span>
                      <span className=\"font-bold\">{waitingSteps[waitingStep] || waitingSteps[0]}</span>
                    </div>
                    <p className=\"mt-1 pl-[42px] text-[11px] text-[#78909d]\">질문에 필요한 정보만 확인하며 답변을 준비합니다.</p>
                  </div>
                )}
"""
if old_loader not in s: raise SystemExit('loader block not found')
s = s.replace(old_loader, new_loader, 1)

old = "        .moni-agent-markdown strong { color: #fff; font-weight: 800; }\n"
new = """        .moni-agent-markdown strong { color: #0f6e62; font-weight: 800; }
        .moni-thinking-dots i { width: 7px; height: 7px; border-radius: 999px; background: #21b99a; animation: moniThinkingBounce 1.05s ease-in-out infinite; will-change: transform; }
        .moni-thinking-dots i:nth-child(2) { background: #38a6cf; animation-delay: 120ms; }
        .moni-thinking-dots i:nth-child(3) { background: #7178c9; animation-delay: 240ms; }
"""
if old not in s: raise SystemExit('strong style not found')
s = s.replace(old, new, 1)

old = """        @keyframes moniAgentBlink { 0%,44%,48%,100% { transform: scaleY(1); } 46% { transform: scaleY(0.12); } }
        @media (prefers-reduced-motion: reduce) { .moni-agent-character, .moni-agent-eye { animation: none !important; } }
"""
new = """        @keyframes moniAgentBlink { 0%,44%,48%,100% { transform: scaleY(1); } 46% { transform: scaleY(0.12); } }
        @keyframes moniThinkingBounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.45; } 30% { transform: translateY(-5px); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .moni-agent-character, .moni-agent-eye, .moni-thinking-dots i { animation: none !important; will-change: auto; } }
"""
if old not in s: raise SystemExit('keyframes not found')
s = s.replace(old, new, 1)

path.write_text(s, encoding='utf-8')
