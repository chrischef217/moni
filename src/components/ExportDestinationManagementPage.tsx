'use client'

import { useEffect, useMemo, useState } from 'react'

type Destination = {
  id: string
  company_name: string
  address: string
  contact_name: string
  phone: string
  zip_code: string
  country: string
  created_at: string
  updated_at: string
}

type FormState = {
  id: string
  company_name: string
  address: string
  contact_name: string
  phone: string
  zip_code: string
  country: string
}

const EMPTY_FORM: FormState = {
  id: '',
  company_name: '',
  address: '',
  contact_name: '',
  phone: '',
  zip_code: '',
  country: '',
}

export default function ExportDestinationManagementPage() {
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  async function load() {
    setError('')
    try {
      const response = await fetch(`/api/moni/export-destinations?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '수출처를 불러오지 못했습니다.')
      setDestinations(payload.destinations || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '수출처를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ko-KR')
    if (!needle) return destinations
    return destinations.filter((item) => `${item.company_name} ${item.country} ${item.contact_name} ${item.phone}`.toLocaleLowerCase('ko-KR').includes(needle))
  }, [destinations, query])

  function openCreate() {
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  function openEdit(item: Destination) {
    setForm({
      id: item.id,
      company_name: item.company_name,
      address: item.address,
      contact_name: item.contact_name,
      phone: item.phone,
      zip_code: item.zip_code,
      country: item.country,
    })
    setError('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setError('')
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/moni/export-destinations', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '수출처 저장에 실패했습니다.')
      setDestinations(payload.destinations || [])
      setModalOpen(false)
      setForm(EMPTY_FORM)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '수출처 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(item: Destination) {
    if (!window.confirm(`${item.company_name} 수출처를 삭제하시겠습니까?`)) return
    setError('')
    try {
      const response = await fetch(`/api/moni/export-destinations?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '수출처 삭제에 실패했습니다.')
      setDestinations(payload.destinations || [])
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '수출처 삭제에 실패했습니다.')
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-transparent px-4 py-6 md:px-6"><div className="mx-auto max-w-[1500px] rounded-[26px] border border-[#d1e2ec] bg-white/95 p-16 text-center text-[#6f8796] shadow-[0_12px_34px_rgba(44,84,108,0.07)]">수출처 정보를 불러오는 중입니다.</div></main>
  }

  return <main data-export-destination-management className="min-h-screen bg-transparent px-4 py-5 text-[#17384d] md:px-6">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-6 shadow-[0_14px_36px_rgba(43,84,109,0.08)] lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.17em] text-[#2b9b76]">EXPORT DESTINATION MASTER</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-[#17384d]">수출처 관리</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6b8392]">해외 거래처의 회사명, 주소, 담당자와 연락처 정보를 등록합니다. 향후 수출등록·Invoice 작성 시 이 수출처 정보를 그대로 불러오도록 연결합니다.</p>
          </div>
          <button type="button" onClick={openCreate} className="h-11 rounded-xl bg-[#16b981] px-5 text-sm font-black text-white shadow-[0_6px_18px_rgba(22,185,129,0.18)]">+ 수출처 등록</button>
        </div>
      </header>

      {error && !modalOpen && <div className="rounded-2xl border border-[#efb9bf] bg-[#fff6f7] p-4 text-sm font-semibold text-[#a94752]">{error}</div>}

      <section className="overflow-hidden rounded-[26px] border border-[#cfe1eb] bg-white/95 shadow-[0_12px_34px_rgba(43,84,109,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#deebf2] px-6 py-5">
          <div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#5d91ad]">REGISTERED DESTINATIONS</p><h2 className="mt-1 text-xl font-black">등록된 수출처</h2></div>
          <div className="flex items-center gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="회사명 · 국가 · 담당자 검색" className="h-10 w-[270px] rounded-xl border border-[#cfe0e9] bg-white px-4 text-sm outline-none focus:border-[#8fc0d6]" /><span className="rounded-xl bg-[#eef7f3] px-3 py-2 text-xs font-black text-[#27785a]">{destinations.length}개</span></div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-sm">
            <thead><tr className="bg-[#f1f7fb] text-left text-xs font-bold text-[#667f8f]"><th className="px-6 py-4">회사명</th><th className="px-4 py-4">국가</th><th className="px-4 py-4">담당자</th><th className="px-4 py-4">전화번호</th><th className="px-4 py-4">우편번호</th><th className="px-4 py-4">주소</th><th className="px-6 py-4 text-center">관리</th></tr></thead>
            <tbody>
              {filtered.map((item) => <tr key={item.id} className="border-t border-[#e7eff4] bg-white hover:bg-[#f9fcfd]">
                <td className="px-6 py-4 font-black text-[#17384d]">{item.company_name}</td>
                <td className="px-4 py-4 font-semibold text-[#31546a]">{item.country}</td>
                <td className="px-4 py-4">{item.contact_name}</td>
                <td className="px-4 py-4 whitespace-nowrap">{item.phone}</td>
                <td className="px-4 py-4 whitespace-nowrap">{item.zip_code}</td>
                <td className="max-w-[360px] px-4 py-4 leading-5 text-[#657e8e]">{item.address}</td>
                <td className="px-6 py-4"><div className="flex justify-center gap-2"><button type="button" onClick={() => openEdit(item)} className="min-w-[58px] rounded-lg border border-[#bfd5e1] bg-white px-3 py-2 text-xs font-black text-[#315d75]">수정</button><button type="button" onClick={() => void remove(item)} className="min-w-[58px] rounded-lg border border-[#efb9bf] bg-[#fffafa] px-3 py-2 text-xs font-black text-[#b44f58]">삭제</button></div></td>
              </tr>)}
              {!filtered.length && <tr><td colSpan={7} className="px-6 py-16 text-center"><div className="text-lg font-black text-[#31546a]">등록된 수출처가 없습니다.</div><div className="mt-2 text-sm text-[#8296a3]">‘수출처 등록’ 버튼으로 해외 거래처를 등록하세요.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    {modalOpen && <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-[rgba(12,31,44,0.34)] p-4 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.currentTarget === event.target) closeModal() }}>
      <div className="flex max-h-[90vh] w-full max-w-[820px] flex-col overflow-hidden rounded-[26px] border border-[#cfe1eb] bg-white shadow-[0_28px_80px_rgba(22,52,72,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#dce9f0] px-6 py-5">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#2b9b76]">EXPORT DESTINATION</p><h2 className="mt-1 text-2xl font-black">{form.id ? '수출처 수정' : '수출처 등록'}</h2></div>
          <button type="button" onClick={closeModal} className="rounded-xl border border-[#d0e0e8] bg-white px-4 py-2.5 text-sm font-bold text-[#587283]">닫기</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error && <div className="mb-4 rounded-xl border border-[#efb9bf] bg-[#fff6f7] px-4 py-3 text-sm font-semibold text-[#a94752]">{error}</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2"><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">회사명 (Company Name)</span><input value={form.company_name} onChange={(event) => setForm((current) => ({ ...current, company_name: event.target.value }))} className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none focus:border-[#7fb9d1]" /></label>
            <label className="md:col-span-2"><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">주소 (Address)</span><textarea value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} rows={3} className="w-full resize-none rounded-xl border border-[#cfe0e9] bg-white px-4 py-3 font-semibold outline-none focus:border-[#7fb9d1]" /></label>
            <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">담당자명 (Contact Name)</span><input value={form.contact_name} onChange={(event) => setForm((current) => ({ ...current, contact_name: event.target.value }))} className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none focus:border-[#7fb9d1]" /></label>
            <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">전화번호 (Phone)</span><input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none focus:border-[#7fb9d1]" /></label>
            <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">우편번호 (ZIP Code)</span><input value={form.zip_code} onChange={(event) => setForm((current) => ({ ...current, zip_code: event.target.value }))} className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none focus:border-[#7fb9d1]" /></label>
            <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">국가 (Country)</span><input value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold outline-none focus:border-[#7fb9d1]" /></label>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#dce9f0] bg-[#f8fbfd] px-6 py-4"><button type="button" onClick={closeModal} disabled={saving} className="rounded-xl border border-[#d0e0e8] bg-white px-5 py-2.5 text-sm font-bold text-[#587283]">취소</button><button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-[#16b981] px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button></div>
      </div>
    </div>}
  </main>
}
