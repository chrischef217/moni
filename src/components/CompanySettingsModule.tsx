'use client'

import { ChangeEvent, useEffect, useState } from 'react'

type CompanyProfile = {
  id: string
  company_name_ko: string
  company_name_en: string
  business_registration_number: string
  representative_name_ko: string
  representative_name_en: string
  opening_date: string | null
  address_ko: string
  address_en: string
  company_email: string
  company_phone: string
  business_type: string
  business_items: string
  logo_data_url: string | null
  logo_file_name: string | null
  signature_data_url: string | null
  signature_file_name: string | null
  updated_at: string
}

type FormState = Omit<CompanyProfile, 'id' | 'updated_at'>

const EMPTY_FORM: FormState = {
  company_name_ko: '',
  company_name_en: '',
  business_registration_number: '',
  representative_name_ko: '',
  representative_name_en: '',
  opening_date: '',
  address_ko: '',
  address_en: '',
  company_email: '',
  company_phone: '',
  business_type: '',
  business_items: '',
  logo_data_url: null,
  logo_file_name: null,
  signature_data_url: null,
  signature_file_name: null,
}

function profileToForm(profile: CompanyProfile): FormState {
  return {
    company_name_ko: profile.company_name_ko || '',
    company_name_en: profile.company_name_en || '',
    business_registration_number: profile.business_registration_number || '',
    representative_name_ko: profile.representative_name_ko || '',
    representative_name_en: profile.representative_name_en || '',
    opening_date: profile.opening_date || '',
    address_ko: profile.address_ko || '',
    address_en: profile.address_en || '',
    company_email: profile.company_email || '',
    company_phone: profile.company_phone || '',
    business_type: profile.business_type || '',
    business_items: profile.business_items || '',
    logo_data_url: profile.logo_data_url || null,
    logo_file_name: profile.logo_file_name || null,
    signature_data_url: profile.signature_data_url || null,
    signature_file_name: profile.signature_file_name || null,
  }
}

export default function CompanySettingsModule() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    setError('')
    try {
      const response = await fetch(`/api/moni/company-profile?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '회사 기본정보를 불러오지 못했습니다.')
      const profile = payload.profile as CompanyProfile | null
      if (!profile) throw new Error('회사 기본정보가 등록되어 있지 않습니다.')
      setForm(profileToForm(profile))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '회사 기본정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  async function save(nextForm = form) {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/moni/company-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextForm),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '회사 기본정보 저장에 실패했습니다.')
      setForm(profileToForm(payload.profile as CompanyProfile))
      setMessage('저장되었습니다.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '회사 기본정보 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function validateImageFile(file: File, label: string) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError(`${label} 이미지는 PNG, JPG 또는 WEBP만 등록할 수 있습니다.`)
      return false
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(`${label} 이미지는 2MB 이하로 등록해 주세요.`)
      return false
    }
    return true
  }

  function handleLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !validateImageFile(file, '회사 로고')) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result) return
      const next = { ...form, logo_data_url: result, logo_file_name: file.name }
      setForm(next)
      void save(next)
    }
    reader.readAsDataURL(file)
  }

  function removeLogo() {
    const next = { ...form, logo_data_url: null, logo_file_name: null }
    setForm(next)
    void save(next)
  }

  function handleSignature(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !validateImageFile(file, '서명')) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result) return
      const next = { ...form, signature_data_url: result, signature_file_name: file.name }
      setForm(next)
      void save(next)
    }
    reader.readAsDataURL(file)
  }

  function removeSignature() {
    const next = { ...form, signature_data_url: null, signature_file_name: null }
    setForm(next)
    void save(next)
  }

  if (loading) {
    return <main className="min-h-screen bg-transparent px-4 py-6 md:px-6"><div className="mx-auto max-w-[1380px] rounded-[26px] border border-[#d1e2ec] bg-white/95 p-16 text-center text-[#6f8796] shadow-[0_12px_34px_rgba(44,84,108,0.07)]">회사 기본정보를 불러오는 중입니다.</div></main>
  }

  return <main data-company-settings className="min-h-screen bg-transparent px-4 py-5 text-[#17384d] md:px-6">
    <div className="mx-auto max-w-[1380px] space-y-5">
      <header className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-6 shadow-[0_14px_36px_rgba(43,84,109,0.08)] lg:p-8">
        <p className="text-xs font-black uppercase tracking-[0.17em] text-[#2b9b76]">ADMIN · COMPANY MASTER</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em]">회사 기본 정보등록</h1>
        <p className="mt-2 text-sm leading-6 text-[#6b8392]">사업자 정보, 회사 로고와 대표자 서명을 한 곳에서 관리합니다. 등록된 정보는 거래명세표와 수출서류에 자동 반영됩니다.</p>
      </header>

      {error && <div className="rounded-2xl border border-[#efb9bf] bg-[#fff6f7] p-4 text-sm font-semibold text-[#a94752]">{error}</div>}
      {message && <div className="rounded-2xl border border-[#b9dfcf] bg-[#f3fbf7] p-4 text-sm font-semibold text-[#277356]">{message}</div>}

      <section className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-6 shadow-[0_12px_34px_rgba(43,84,109,0.07)] lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#deebf2] pb-5">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#5d91ad]">COMPANY INFORMATION</p><h2 className="mt-1 text-xl font-black">사업자·회사정보</h2></div>
          <button type="button" onClick={() => void save()} disabled={saving} className="h-11 rounded-xl bg-[#16b981] px-6 text-sm font-black text-white shadow-[0_6px_18px_rgba(22,185,129,0.18)] disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Field label="상호" value={form.company_name_ko} onChange={(value) => updateField('company_name_ko', value)} />
          <Field label="Company Name (English)" value={form.company_name_en} onChange={(value) => updateField('company_name_en', value)} placeholder="수출서류용 영문 회사명" />
          <Field label="사업자등록번호" value={form.business_registration_number} onChange={(value) => updateField('business_registration_number', value)} />
          <Field label="개업연월일" value={form.opening_date || ''} onChange={(value) => updateField('opening_date', value)} type="date" />
          <Field label="대표자명" value={form.representative_name_ko} onChange={(value) => updateField('representative_name_ko', value)} />
          <Field label="Representative Name (English)" value={form.representative_name_en} onChange={(value) => updateField('representative_name_en', value)} />
          <Field label="회사 이메일" value={form.company_email} onChange={(value) => updateField('company_email', value)} type="email" />
          <Field label="회사 연락처" value={form.company_phone} onChange={(value) => updateField('company_phone', value)} />
          <TextArea label="사업장 주소" value={form.address_ko} onChange={(value) => updateField('address_ko', value)} className="lg:col-span-2" />
          <TextArea label="Business Address (English)" value={form.address_en} onChange={(value) => updateField('address_en', value)} placeholder="수출서류용 영문 주소" className="lg:col-span-2" />
          <TextArea label="업태" value={form.business_type} onChange={(value) => updateField('business_type', value)} />
          <TextArea label="종목" value={form.business_items} onChange={(value) => updateField('business_items', value)} />
        </div>
      </section>

      <section className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-6 shadow-[0_12px_34px_rgba(43,84,109,0.07)] lg:p-7">
        <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#ef7b3a]">COMPANY LOGO</p><h2 className="mt-1 text-xl font-black">회사 로고 등록</h2><p className="mt-2 text-sm text-[#718896]">등록된 로고는 거래명세표 좌측 상단에 자동 표시됩니다.</p></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex min-h-[150px] items-center justify-center rounded-2xl border border-dashed border-[#c8dce7] bg-[#f8fbfd] p-5">
            {form.logo_data_url ? <img src={form.logo_data_url} alt="등록 회사 로고" className="max-h-[105px] max-w-[320px] object-contain" /> : <div className="text-center text-sm text-[#8296a3]">등록된 회사 로고가 없습니다.</div>}
          </div>
          <div className="flex min-w-[180px] flex-col gap-2">
            <label className="cursor-pointer rounded-xl bg-[#315d75] px-5 py-3 text-center text-sm font-black text-white"><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogo} />{form.logo_data_url ? '로고 이미지 변경' : '로고 이미지 등록'}</label>
            <button type="button" onClick={removeLogo} disabled={!form.logo_data_url || saving} className="rounded-xl border border-[#efb9bf] bg-[#fffafa] px-5 py-3 text-sm font-black text-[#b44f58] disabled:cursor-not-allowed disabled:opacity-40">로고 삭제</button>
            <div className="px-1 text-center text-xs leading-5 text-[#8296a3]">PNG · JPG · WEBP<br />최대 2MB</div>
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-6 shadow-[0_12px_34px_rgba(43,84,109,0.07)] lg:p-7">
        <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#8a72d5]">AUTHORIZED SIGNATURE</p><h2 className="mt-1 text-xl font-black">대표자 서명 등록</h2><p className="mt-2 text-sm text-[#718896]">등록된 서명은 수출용 Commercial Invoice와 Packing List의 Signature 영역에 자동 삽입됩니다.</p></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-[#c8dce7] bg-[#f8fbfd] p-5">
            {form.signature_data_url ? <img src={form.signature_data_url} alt="대표자 등록 서명" className="max-h-[130px] max-w-full object-contain" /> : <div className="text-center text-sm text-[#8296a3]">등록된 서명이 없습니다.</div>}
          </div>
          <div className="flex min-w-[180px] flex-col gap-2">
            <label className="cursor-pointer rounded-xl bg-[#315d75] px-5 py-3 text-center text-sm font-black text-white"><input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleSignature} />{form.signature_data_url ? '서명 이미지 변경' : '서명 이미지 등록'}</label>
            <button type="button" onClick={removeSignature} disabled={!form.signature_data_url || saving} className="rounded-xl border border-[#efb9bf] bg-[#fffafa] px-5 py-3 text-sm font-black text-[#b44f58] disabled:cursor-not-allowed disabled:opacity-40">서명 삭제</button>
            <div className="px-1 text-center text-xs leading-5 text-[#8296a3]">PNG · JPG · WEBP<br />최대 2MB</div>
          </div>
        </div>
      </section>
    </div>
  </main>
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-12 w-full rounded-xl border border-[#cfe0e9] bg-white px-4 font-semibold text-[#17384d] outline-none focus:border-[#7fb9d1]" /></label>
}

function TextArea({ label, value, onChange, placeholder = '', className = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return <label className={className}><span className="mb-1.5 block text-sm font-bold text-[#5f7888]">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="w-full resize-none rounded-xl border border-[#cfe0e9] bg-white px-4 py-3 font-semibold text-[#17384d] outline-none focus:border-[#7fb9d1]" /></label>
}
