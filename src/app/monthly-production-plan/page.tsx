'use client'

import { useEffect, useMemo, useState } from 'react'

type Plan = {
  id: string
  source: 'user' | 'ai'
  plan_date: string
  product_id: string
  product_name: string
  planned_quantity_g: number
  note?: string | null
  confidence?: string
  history_count?: number
  median_gap_days?: number
}

type Product = { id: string; name: string }

type Requirement = {
  material_id: string
  material_name: string
  current_stock_g: number
  required_g: number
  projected_balance_g: number
  shortage_g: number
  first_shortage_date: string | null
  status: '부족' | '주의' | '충분'
}

type RequirementGroup = { requirements: Requirement[]; issues: unknown[] }

type Payload = {
  ok: boolean
  error?: string
  plans: Plan[]
  forecasts: Plan[]
  products: Product[]
  confirmed: RequirementGroup
  ai_only: RequirementGroup
}

type Level = 'stable' | 'standard' | 'expanded'

const levelLabels: Record<Level, { label: string; description: string; logic: string }> = {
  stable: {
    label: '안정형',
    description: '반복성이 높은 제품만 표시',
    logic: '생산 이력 6회 이상이고 생산 간격 변동이 작은 제품만 선택 · 다음 날짜는 최근 생산일에 과거 생산 간격의 중앙값을 더해 계산 · 수량은 과거 실제 생산량의 중앙값으로 계산',
  },
  standard: {
    label: '표준형',
    description: '일반적인 반복 패턴 기준',
    logic: '생산 이력 4회 이상이고 생산 간격이 지나치게 불규칙하지 않은 제품을 선택 · 다음 날짜는 최근 생산일에 생산 간격 중앙값을 더해 계산 · 수량은 과거 실제 생산량의 중앙값으로 계산',
  },
  expanded: {
    label: '확장형',
    description: '가능성이 있는 제품까지 넓게 표시',
    logic: '생산 이력 3회 이상인 제품까지 범위를 넓혀 제안 · 다음 날짜와 수량은 과거 생산 간격과 실제 생산량의 중앙값으로 계산',
  },
}

function formatKg(value: number) {
  const kg = Number(value || 0) / 1000
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: kg >= 100 ? 0 : 1 }).format(kg)}kg`
}

function monthValue(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + amount)
  return date.toISOString().slice(0, 7)
}

function monthDays(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`)
  const firstWeekday = first.getUTCDay()
  const next = new Date(first)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const dayCount = Math.round((next.getTime() - first.getTime()) / 86400000)
  const cells: { date: string; current: boolean }[] = []

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

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('ko-KR')
}

export default function MonthlyProductionPlanPage() {
  const [month, setMonth] = useState(monthValue())
  const [level, setLevel] = useState<Level>('standard')
  const [showAi, setShowAi] = useState(true)
  const [aiOnlyView, setAiOnlyView] = useState(false)
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [selectedDate, setSelectedDate] = useState(`${month}-01`)
  const [productId, setProductId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [productMenuOpen, setProductMenuOpen] = useState(false)
  const [quantityKg, setQuantityKg] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/monthly-production-plans?month=${month}&level=${level}`, { cache: 'no-store' })
      const payload = (await response.json()) as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '조회에 실패했습니다.')
      setData(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '조회에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [month, level])

  const events = useMemo(() => {
    const items = [...(data?.plans ?? [])]
    if (showAi) items.push(...(data?.forecasts ?? []))
    return items
  }, [data, showAi])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Plan[]>()
    for (const event of events) {
      map.set(event.plan_date, [...(map.get(event.plan_date) ?? []), event])
    }
    return map
  }, [events])

  const filteredProducts = useMemo(() => {
    const products = data?.products ?? []
    const keyword = normalize(productSearch)
    if (!keyword) return products.slice(0, 60)
    return products.filter((product) => normalize(product.name).includes(keyword)).slice(0, 60)
  }, [data, productSearch])

  const requirements = aiOnlyView
    ? data?.ai_only?.requirements ?? []
    : data?.confirmed?.requirements ?? []
  const shortageCount = requirements.filter((row) => row.status === '부족').length
  const warningCount = requirements.filter((row) => row.status === '주의').length
  const userTotal = (data?.plans ?? []).reduce((sum, row) => sum + Number(row.planned_quantity_g), 0)
  const aiTotal = (data?.forecasts ?? []).reduce((sum, row) => sum + Number(row.planned_quantity_g), 0)
  const requirementBasis = aiOnlyView ? 'AI 예측 기준' : '예상 계획 기준'
  const requirementBasisColor = aiOnlyView ? 'text-green-300' : 'text-blue-300'

  function selectProduct(product: Product) {
    setProductId(product.id)
    setProductSearch(product.name)
    setProductMenuOpen(false)
  }

  function openCreate(date: string) {
    setEditing(null)
    setSelectedDate(date)
    setProductId('')
    setProductSearch('')
    setProductMenuOpen(false)
    setQuantityKg('')
    setNote('')
    setFormOpen(true)
  }

  function openEdit(plan: Plan) {
    setEditing(plan)
    setSelectedDate(plan.plan_date)
    setProductId(plan.product_id)
    setProductSearch(plan.product_name)
    setProductMenuOpen(false)
    setQuantityKg(String(plan.planned_quantity_g / 1000))
    setNote(plan.note ?? '')
    setFormOpen(true)
  }

  async function save() {
    const exactName = normalize(productSearch)
    const product = data?.products.find((item) => item.id === productId)
      ?? data?.products.find((item) => normalize(item.name) === exactName)
    const plannedQuantityG = Math.round(Number(quantityKg) * 1000)

    if (!product) {
      setError('제품 목록에서 정확한 제품을 검색해 선택해 주세요.')
      return
    }
    if (!selectedDate || plannedQuantityG <= 0) {
      setError('생산일과 생산량을 확인해 주세요.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/moni/monthly-production-plans', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          plan_date: selectedDate,
          product_id: product.id,
          product_name: product.name,
          planned_quantity_g: plannedQuantityG,
          note,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '저장에 실패했습니다.')
      setFormOpen(false)
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('이 예상 계획을 삭제할까요?')) return
    const response = await fetch(`/api/moni/monthly-production-plans?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok || !result.ok) {
      setError(result.error || '삭제에 실패했습니다.')
      return
    }
    await load()
  }

  function adoptAi(plan: Plan) {
    setEditing(null)
    setSelectedDate(plan.plan_date)
    setProductId(plan.product_id)
    setProductSearch(plan.product_name)
    setProductMenuOpen(false)
    setQuantityKg(String(plan.planned_quantity_g / 1000))
    setNote('AI 예측에서 예상 계획으로 전환')
    setFormOpen(true)
  }

  return (
    <main className="min-h-screen bg-[#071426] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1700px]">
        <section className="min-w-0 flex-1 bg-[#0b1729] p-4 md:p-7">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black md:text-3xl">월간 생산계획</h1>
              <p className="mt-1 text-sm text-slate-400">사용자 예상 계획과 AI 예측을 각각 분리해 원료 부족을 확인합니다.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2">
                <span>AI 예측 표시</span>
                <input type="checkbox" checked={showAi} onChange={(event) => setShowAi(event.target.checked)} className="h-5 w-5 accent-green-500" />
              </label>
              <button onClick={() => openCreate(`${month}-01`)} className="rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-500">+ 예상 계획 추가</button>
            </div>
          </header>

          {error && <div className="mb-4 rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-red-200">{error}</div>}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg border border-slate-700 px-3 py-2">‹</button>
              <button onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg border border-slate-700 px-3 py-2">›</button>
              <b className="text-2xl">{month.replace('-', '년 ')}월</b>
              <button onClick={() => setMonth(monthValue())} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">오늘</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2">
                <span className="text-blue-300">예상 계획(사용자 입력)</span>
                <b className="ml-3">{data?.plans.length ?? 0}건 / {formatKg(userTotal)}</b>
              </div>
              <div className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2">
                <span className="text-green-300">AI 예측</span>
                <b className="ml-3">{data?.forecasts.length ?? 0}건 / {formatKg(aiTotal)}</b>
              </div>
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-red-300">
                <span className={requirementBasisColor}>{requirementBasis}</span> 부족 <b>{shortageCount}개</b>
              </div>
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-300">
                <span className={requirementBasisColor}>{requirementBasis}</span> 주의 <b>{warningCount}개</b>
              </div>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
            <div className="min-w-0 flex-1">
              <b>AI 예측 단계</b>
              <span className="ml-2 text-sm text-slate-400">
                {levelLabels[level].description}
                <span className="ml-1 text-slate-500">({levelLabels[level].logic})</span>
              </span>
            </div>
            <div className="flex rounded-lg border border-slate-600 p-1">
              {(Object.keys(levelLabels) as Level[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setLevel(item)}
                  className={`rounded-md px-5 py-2 text-sm font-bold ${level === item ? 'bg-green-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  {levelLabels[item].label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/40">
            <div className="grid grid-cols-7 border-b border-slate-700 text-center text-sm font-bold text-slate-300">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
                <div key={day} className={`p-3 ${index === 0 ? 'text-red-400' : index === 6 ? 'text-blue-400' : ''}`}>{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthDays(month).map((cell) => {
                const dayEvents = eventsByDate.get(cell.date) ?? []
                return (
                  <button
                    key={cell.date}
                    onClick={() => openCreate(cell.date)}
                    className={`min-h-28 border-b border-r border-slate-800 p-2 text-left align-top hover:bg-slate-800/50 ${cell.current ? '' : 'opacity-35'}`}
                  >
                    <span className="text-sm font-bold">{Number(cell.date.slice(-2))}</span>
                    <div className="mt-2 space-y-1" onClick={(event) => event.stopPropagation()}>
                      {dayEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className={`rounded-lg border px-2 py-1 text-xs ${event.source === 'user' ? 'border-blue-500 bg-blue-500/10 text-blue-100' : 'border-dashed border-green-500 bg-green-500/10 text-green-100'}`}
                        >
                          <div className="flex justify-between gap-1">
                            <b className="truncate">{event.product_name}</b>
                            <span>{formatKg(event.planned_quantity_g)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                            <span>{event.source === 'user' ? '예상 계획' : '[AI예측]'}</span>
                            {event.source === 'user' ? (
                              <>
                                <button onClick={() => openEdit(event)} className="underline">수정</button>
                                <button onClick={() => void remove(event.id)} className="underline">삭제</button>
                              </>
                            ) : (
                              <button onClick={() => adoptAi(event)} className="underline">예상 계획으로 전환</button>
                            )}
                          </div>
                        </div>
                      ))}
                      {dayEvents.length > 3 && <div className="text-xs text-slate-400">외 {dayEvents.length - 3}건</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <section className="mt-5 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/50">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-4">
              <div>
                <h2 className="text-xl font-bold">원료 필요량 현황</h2>
                <p className={`text-sm ${aiOnlyView ? 'text-green-300' : 'text-blue-300'}`}>
                  {aiOnlyView ? 'AI 예측만 기준 — 사용자 예상 계획은 포함하지 않음' : '사용자 예상 계획만 기준 — AI 예측은 포함하지 않음'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={aiOnlyView} onChange={(event) => setAiOnlyView(event.target.checked)} className="h-5 w-5 accent-green-500" />
                  AI 예측만 보기
                </label>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    {['상태', '원료명', '현재재고', '필요량', '예상잔량', '최초 부족일', '부족량'].map((title) => (
                      <th key={title} className="px-4 py-3 text-left">{title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((row) => (
                    <tr key={row.material_id} className="border-t border-slate-800">
                      <td className="px-4 py-3">
                        <span className={`rounded-md px-2 py-1 font-bold ${row.status === '부족' ? 'bg-red-500/20 text-red-300' : row.status === '주의' ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300'}`}>{row.status}</span>
                      </td>
                      <td className="px-4 py-3 font-bold">{row.material_name}</td>
                      <td className="px-4 py-3">{formatKg(row.current_stock_g)}</td>
                      <td className="px-4 py-3">{formatKg(row.required_g)}</td>
                      <td className={`px-4 py-3 font-bold ${row.projected_balance_g < 0 ? 'text-red-300' : 'text-green-300'}`}>{formatKg(row.projected_balance_g)}</td>
                      <td className="px-4 py-3">{row.first_shortage_date ?? '-'}</td>
                      <td className="px-4 py-3 font-bold text-red-300">{row.shortage_g ? formatKg(row.shortage_g) : '-'}</td>
                    </tr>
                  ))}
                  {!loading && !requirements.length && (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400">
                        {aiOnlyView ? '선택한 AI 예측 단계에서 계산할 원료가 없습니다.' : '예상 계획을 달력에 추가하면 필요한 원료가 표시됩니다.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-600 bg-[#101d31] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">{editing ? '예상 계획 수정' : '예상 계획 추가'}</h2>
              <button onClick={() => setFormOpen(false)} className="text-2xl text-slate-400">×</button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm text-slate-300">생산예정일</span>
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-900 p-3" />
              </label>

              <div className="relative">
                <label htmlFor="monthly-product-search" className="mb-1 block text-sm text-slate-300">제품</label>
                <input
                  id="monthly-product-search"
                  type="search"
                  autoComplete="off"
                  placeholder="제품명을 입력하거나 목록에서 선택"
                  value={productSearch}
                  onFocus={() => setProductMenuOpen(true)}
                  onBlur={() => window.setTimeout(() => setProductMenuOpen(false), 150)}
                  onChange={(event) => {
                    const value = event.target.value
                    const match = data?.products.find((product) => normalize(product.name) === normalize(value))
                    setProductSearch(value)
                    setProductId(match?.id ?? '')
                    setProductMenuOpen(true)
                  }}
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 p-3"
                />
                {productMenuOpen && (
                  <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-600 bg-[#0b1729] p-1 shadow-2xl">
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectProduct(product)}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-700 ${product.id === productId ? 'bg-blue-600 text-white' : 'text-slate-200'}`}
                      >
                        {product.name}
                      </button>
                    ))}
                    {!filteredProducts.length && <div className="px-3 py-4 text-center text-sm text-slate-400">검색 결과가 없습니다.</div>}
                  </div>
                )}
                <p className="mt-1 text-xs text-slate-500">등록된 제품만 저장할 수 있습니다.</p>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm text-slate-300">예상 생산량(kg)</span>
                <input type="number" min="0.001" step="0.001" value={quantityKg} onChange={(event) => setQuantityKg(event.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-900 p-3" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-slate-300">메모</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-900 p-3" rows={3} />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-600 px-5 py-3">취소</button>
              <button disabled={saving} onClick={() => void save()} className="rounded-xl bg-blue-600 px-5 py-3 font-bold disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
