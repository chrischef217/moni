'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

type Employee = {
  id: string
  name: string
  person_type: 'employee'
  status: 'active' | 'inactive'
  phone?: string | null
  email?: string | null
  contract_start?: string | null
  contract_end?: string | null
  commission_rate: number
  pay_type: 'fixed'
  pay_rate: number
  withholding_rate: number
  contract_document_ready: boolean
  id_document_ready: boolean
  bank_document_ready: boolean
  bank_name?: string | null
  bank_account_holder?: string | null
  bank_account_number?: string | null
  note?: string | null
}

type Payload = {
  ok: boolean
  error?: string
  people: Array<Employee | Record<string, unknown>>
}

type EmployeeForm = Omit<Employee, 'id'>

const inputClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500'
const secondaryButton = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white'
const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50'

function emptyEmployee(): EmployeeForm {
  return {
    name: '',
    person_type: 'employee',
    status: 'active',
    phone: '',
    email: '',
    contract_start: '',
    contract_end: '',
    commission_rate: 0,
    pay_type: 'fixed',
    pay_rate: 0,
    withholding_rate: 0,
    contract_document_ready: false,
    id_document_ready: false,
    bank_document_ready: false,
    bank_name: '',
    bank_account_holder: '',
    bank_account_number: '',
    note: '',
  }
}

function money(value: unknown) {
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number(value ?? 0)))}원`
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block text-sm text-slate-300 ${className}`}><span>{label}</span>{children}</label>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h2 className="text-xl font-black text-white">{title}</h2>
          <button type="button" onClick={onClose} className={secondaryButton}>닫기</button>
        </div>
        <div className="max-h-[calc(94vh-78px)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, tone = 'blue' }: { label: string; value: string; tone?: 'blue' | 'green' | 'amber' }) {
  const toneClass = tone === 'green'
    ? 'border-green-500/30 bg-green-500/10 text-green-200'
    : tone === 'amber'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
  return <div className={`rounded-2xl border p-5 ${toneClass}`}><div className="text-sm opacity-80">{label}</div><div className="mt-2 text-2xl font-black">{value}</div></div>
}

function isEmployee(value: Employee | Record<string, unknown>): value is Employee {
  return value.person_type === 'employee' && typeof value.id === 'string' && typeof value.name === 'string'
}

export default function RegularEmployeeManagementModule() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<EmployeeForm>(emptyEmployee())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
      const response = await fetch(`/api/moni/business-management?month=${month}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = (await response.json()) as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '직원정보를 불러오지 못했습니다.')
      setEmployees((payload.people ?? []).filter(isEmployee))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '직원정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const activeEmployees = useMemo(() => employees.filter((row) => row.status === 'active'), [employees])
  const missingDocuments = useMemo(
    () => activeEmployees.filter((row) => !(row.contract_document_ready && row.id_document_ready && row.bank_document_ready)).length,
    [activeEmployees],
  )

  function openEmployee(row?: Employee) {
    setError('')
    setNotice('')
    setEditingId(row?.id ?? '')
    setForm(row ? {
      name: row.name,
      person_type: 'employee',
      status: row.status,
      phone: row.phone ?? '',
      email: row.email ?? '',
      contract_start: row.contract_start ?? '',
      contract_end: row.contract_end ?? '',
      commission_rate: 0,
      pay_type: 'fixed',
      pay_rate: Number(row.pay_rate ?? 0),
      withholding_rate: 0,
      contract_document_ready: Boolean(row.contract_document_ready),
      id_document_ready: Boolean(row.id_document_ready),
      bank_document_ready: Boolean(row.bank_document_ready),
      bank_name: row.bank_name ?? '',
      bank_account_holder: row.bank_account_holder ?? '',
      bank_account_number: row.bank_account_number ?? '',
      note: row.note ?? '',
    } : emptyEmployee())
    setModalOpen(true)
  }

  async function saveEmployee() {
    if (!form.name.trim()) return setError('직원 이름을 입력해 주세요.')
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/moni/business-management', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'people', id: editingId || undefined, data: form }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '직원정보 저장에 실패했습니다.')
      setModalOpen(false)
      setNotice(editingId ? '직원정보를 수정했습니다.' : '정규직 직원을 등록했습니다.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '직원정보 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleEmployee(row: Employee) {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/moni/business-management', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'people', id: row.id, data: { status: row.status === 'active' ? 'inactive' : 'active' } }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '재직상태 변경에 실패했습니다.')
      setNotice(row.status === 'active' ? '퇴사 처리했습니다. 기록은 보존됩니다.' : '재직 상태로 복원했습니다.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '재직상태 변경에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-6 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-blue-300">MONI HUMAN RESOURCES</p>
              <h1 className="mt-1 text-3xl font-black">정규직 직원관리</h1>
              <p className="mt-2 text-sm text-slate-400">정규직 직원의 재직정보, 급여 기준, 계좌정보와 필수서류 상태를 관리합니다.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void load()} className={secondaryButton}>새로고침</button>
              <button type="button" onClick={() => openEmployee()} className={primaryButton}>+ 직원 등록</button>
            </div>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="전체 정규직" value={`${employees.length}명`} />
          <SummaryCard label="현재 재직" value={`${activeEmployees.length}명`} tone="green" />
          <SummaryCard label="서류 확인 필요" value={`${missingDocuments}명`} tone="amber" />
        </div>

        {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">{error}</div>}
        {notice && <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-4 text-green-200">{notice}</div>}

        <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60">
          <div className="border-b border-slate-700 p-5">
            <h2 className="text-xl font-black">직원 목록</h2>
            <p className="mt-1 text-sm text-slate-400">퇴사 처리는 삭제가 아니라 상태 변경으로 기록을 보존합니다.</p>
          </div>
          {loading ? <div className="p-14 text-center text-slate-400">직원정보를 불러오는 중입니다.</div> : !employees.length ? <div className="p-14 text-center text-slate-400">등록된 정규직 직원이 없습니다.</div> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-300"><tr>{['상태','이름','입사일','퇴사일','월 기본급','필수서류','연락처','계좌정보','관리'].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead>
                <tbody>{employees.map((row) => {
                  const docs = [row.contract_document_ready, row.id_document_ready, row.bank_document_ready].filter(Boolean).length
                  return <tr key={row.id} className={`border-t border-slate-800 ${row.status === 'inactive' ? 'opacity-55' : ''}`}>
                    <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 font-bold ${row.status === 'active' ? 'bg-green-500/15 text-green-300' : 'bg-slate-700 text-slate-400'}`}>{row.status === 'active' ? '재직' : '퇴사'}</span></td>
                    <td className="px-4 py-3 font-bold text-white">{row.name}</td>
                    <td className="whitespace-nowrap px-4 py-3">{row.contract_start || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3">{row.contract_end || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3">{money(row.pay_rate)}</td>
                    <td className={`px-4 py-3 font-bold ${docs === 3 ? 'text-green-300' : 'text-amber-300'}`}>{docs}/3</td>
                    <td className="px-4 py-3">{row.phone || row.email || '-'}</td>
                    <td className="px-4 py-3">{row.bank_name || '-'}<div className="text-xs text-slate-500">{row.bank_account_number || ''}</div></td>
                    <td className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => openEmployee(row)} className="mr-3 underline">수정</button><button type="button" disabled={saving} onClick={() => void toggleEmployee(row)} className="underline">{row.status === 'active' ? '퇴사 처리' : '재직 복원'}</button></td>
                  </tr>
                })}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {modalOpen && <Modal title={editingId ? '정규직 직원 수정' : '정규직 직원 등록'} onClose={() => setModalOpen(false)}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="직원 이름 *"><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={inputClass} /></Field>
          <Field label="재직상태"><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as EmployeeForm['status'] }))} className={inputClass}><option value="active">재직</option><option value="inactive">퇴사</option></select></Field>
          <Field label="입사일"><input type="date" value={form.contract_start ?? ''} onChange={(event) => setForm((current) => ({ ...current, contract_start: event.target.value }))} className={inputClass} /></Field>
          <Field label="퇴사일"><input type="date" value={form.contract_end ?? ''} onChange={(event) => setForm((current) => ({ ...current, contract_end: event.target.value }))} className={inputClass} /></Field>
          <Field label="월 기본급"><input type="number" min="0" step="1" value={form.pay_rate} onChange={(event) => setForm((current) => ({ ...current, pay_rate: Number(event.target.value) }))} className={inputClass} /></Field>
          <Field label="전화번호"><input value={form.phone ?? ''} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className={inputClass} /></Field>
          <Field label="이메일"><input type="email" value={form.email ?? ''} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} /></Field>
          <Field label="은행"><input value={form.bank_name ?? ''} onChange={(event) => setForm((current) => ({ ...current, bank_name: event.target.value }))} className={inputClass} /></Field>
          <Field label="예금주"><input value={form.bank_account_holder ?? ''} onChange={(event) => setForm((current) => ({ ...current, bank_account_holder: event.target.value }))} className={inputClass} /></Field>
          <Field label="계좌번호"><input value={form.bank_account_number ?? ''} onChange={(event) => setForm((current) => ({ ...current, bank_account_number: event.target.value }))} className={inputClass} /></Field>
          <div className="md:col-span-2 grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-4 md:grid-cols-3">
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.contract_document_ready} onChange={(event) => setForm((current) => ({ ...current, contract_document_ready: event.target.checked }))} />근로계약서 확인</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.id_document_ready} onChange={(event) => setForm((current) => ({ ...current, id_document_ready: event.target.checked }))} />신분증 확인</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.bank_document_ready} onChange={(event) => setForm((current) => ({ ...current, bank_document_ready: event.target.checked }))} />통장사본 확인</label>
          </div>
          <Field label="비고" className="md:col-span-2"><textarea rows={4} value={form.note ?? ''} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} className={inputClass} /></Field>
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setModalOpen(false)} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={() => void saveEmployee()} className={primaryButton}>{saving ? '저장 중...' : '저장'}</button></div>
      </Modal>}
    </main>
  )
}
