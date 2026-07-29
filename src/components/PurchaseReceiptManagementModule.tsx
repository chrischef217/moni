'use client'

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import ReceiptEditorModal from './purchase-receipts/ReceiptEditorModal'
import ReceiptHistoryTable from './purchase-receipts/ReceiptHistoryTable'
import type { DateMode, PurchaseCategory, PurchaseReceipt, ReceiptDraft, ReceiptPayload, ReceiptView } from './purchase-receipts/types'
import { emptyDraft, excelDate, monthStart, normalize, paymentCode, rawMaterialName, receiptDate, today } from './purchase-receipts/utils'

type Props = {
  onNavigate: (view: ReceiptView) => void
}

export default function PurchaseReceiptManagementModule({ onNavigate }: Props) {
  const initialToday = today()
  const [data, setData] = useState<ReceiptPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [excelBusy, setExcelBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [dateMode, setDateMode] = useState<DateMode>('MONTH')
  const [selectedMonth, setSelectedMonth] = useState(initialToday.slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(initialToday)
  const [dateFrom, setDateFrom] = useState(monthStart(initialToday))
  const [dateTo, setDateTo] = useState(initialToday)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<PurchaseReceipt | null>(null)
  const [draft, setDraft] = useState<ReceiptDraft>(emptyDraft())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/moni/purchase-receipts', { cache: 'no-store' })
      const result = await response.json() as ReceiptPayload
      if (!response.ok || !result.ok) throw new Error(result.error || '입고내역을 불러오지 못했습니다.')
      setData(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '입고내역을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const post = async (url: string, body: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '처리에 실패했습니다.')
      await load()
      return result
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '처리에 실패했습니다.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const suppliers = data?.suppliers ?? []
  const rawMaterials = data?.raw_materials ?? []
  const packagingMaterials = data?.packaging_materials ?? []
  const rows = data?.rows ?? []
  const query = normalize(search)

  const searchedRows = useMemo(
    () => rows.filter((row) => normalize([row.supplier_name_snapshot, row.item_name, row.purchase_category].join(' ')).includes(query)),
    [rows, query],
  )

  const filteredRows = useMemo(() => searchedRows.filter((row) => {
    const value = receiptDate(row)
    if (dateMode === 'MONTH') return Boolean(selectedMonth) && value.startsWith(selectedMonth)
    if (dateMode === 'DATE') return Boolean(selectedDate) && value === selectedDate
    if (dateMode === 'RANGE') {
      if (dateFrom && value < dateFrom) return false
      if (dateTo && value > dateTo) return false
    }
    return true
  }), [searchedRows, dateMode, selectedMonth, selectedDate, dateFrom, dateTo])

  const openCreate = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setEditorOpen(true)
  }

  const openEdit = (row: PurchaseReceipt) => {
    const category: PurchaseCategory = row.purchase_category === 'PACKAGING' ? 'PACKAGING' : 'RAW_MATERIAL'
    setEditing(row)
    setDraft({
      supplier_id: row.supplier_id || '',
      supplier_name_snapshot: row.supplier_name_snapshot || '',
      purchase_date: row.purchase_date || receiptDate(row),
      receipt_date: receiptDate(row),
      purchase_category: category,
      material_id: row.material_id || '',
      quantity: Number(row.quantity || 0),
      unit: category === 'PACKAGING' ? 'EA' : row.unit === 'EA' ? 'EA' : row.unit === 'G' ? 'G' : 'KG',
      unit_price: Number(row.unit_price || 0),
      supply_amount: Number(row.supply_amount || 0),
      vat_amount: Number(row.vat_amount || 0),
      total_amount: Number(row.total_amount || 0),
      due_date: row.due_date || '',
      planned_payment_method: row.planned_payment_method || 'BANK_TRANSFER',
      planned_payment_account: row.planned_payment_account || '',
      planned_card_name: row.planned_card_name || '',
      planned_installment_months: Number(row.planned_installment_months || 1),
      tax_invoice_status: row.tax_invoice_status || 'NOT_RECEIVED',
      notes: row.notes || '',
    })
    setEditorOpen(true)
  }

  const saveReceipt = async () => {
    const body = { ...draft }
    let result: unknown
    if (!editing) {
      result = await post('/api/moni/purchases', { action: 'create_purchase', ...body })
    } else if (editing.legacy_record) {
      result = await post('/api/moni/purchase-receipts', {
        action: 'update_legacy',
        source_transaction_type: editing.source_transaction_type,
        source_transaction_id: editing.source_transaction_id,
        ...body,
      })
    } else {
      result = await post('/api/moni/purchase-receipts', { action: 'update_purchase', id: editing.id, ...body })
    }
    if (result) {
      setEditorOpen(false)
      setEditing(null)
      setMessage(editing ? '입고내역과 연결 재고를 수정했습니다.' : '매입·입고를 등록했습니다.')
    }
  }

  const deleteReceipt = async (row: PurchaseReceipt) => {
    const warning = row.legacy_record
      ? `${row.item_name} 기존 입고내역을 삭제하시겠습니까?\n원료·부재료 수불부와 현재고에서도 즉시 삭제됩니다.`
      : `${row.item_name} 매입·입고내역을 삭제하시겠습니까?\n수불부·현재고·미지급금에서 함께 삭제됩니다.`
    if (!window.confirm(warning)) return
    const result = row.legacy_record
      ? await post('/api/moni/purchase-receipts', { action: 'delete_legacy', source_transaction_type: row.source_transaction_type, source_transaction_id: row.source_transaction_id })
      : await post('/api/moni/purchase-receipts', { action: 'delete_purchase', id: row.id })
    if (result) setMessage('입고내역과 연결 재고를 삭제했습니다.')
  }

  const updateTax = async (row: PurchaseReceipt, status: string) => {
    await post('/api/moni/purchase-receipts', { action: 'update_tax', id: row.id, tax_invoice_status: status, total_amount: row.total_amount })
  }

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const sample = [
      { 매입처: '등록된 매입처명', 구분: '원재료', 품목: '등록된 원재료명', 수량: 10, 단위: 'kg', 매입일: initialToday, 입고일: initialToday, 단가: 1000, 공급가액: 10000, 부가세: 1000, 지급예정일: '', 결제수단: '계좌이체', '계좌/카드': '', 할부개월: 1, 비고: '' },
      { 매입처: '등록된 매입처명', 구분: '부재료', 품목: '등록된 부재료명', 수량: 100, 단위: 'EA', 매입일: initialToday, 입고일: initialToday, 단가: 100, 공급가액: 10000, 부가세: 1000, 지급예정일: '', 결제수단: '카드', '계좌/카드': '법인카드 별칭', 할부개월: 3, 비고: '' },
    ]
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(sample)
    sheet['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 22 }]
    XLSX.utils.book_append_sheet(workbook, sheet, '매입입고')
    XLSX.writeFile(workbook, 'MONI_매입입고_일괄등록_템플릿.xlsx')
  }

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setExcelBusy(true)
    setError('')
    setMessage('')
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) throw new Error('엑셀 시트를 찾을 수 없습니다.')
      const imported = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: true })
      if (!imported.length) throw new Error('등록할 내역이 없습니다.')
      if (imported.length > 500) throw new Error('한 번에 최대 500건까지 등록할 수 있습니다.')

      const supplierByName = new Map(suppliers.filter((row) => row.status === 'ACTIVE').map((row) => [normalize(row.company_name), row]))
      const rawByName = new Map<string, typeof rawMaterials[number]>()
      for (const material of rawMaterials) {
        rawByName.set(normalize(material.item_name), material)
        rawByName.set(normalize(rawMaterialName(material)), material)
      }
      const packagingByName = new Map(packagingMaterials.map((row) => [normalize(row.material_name), row]))

      const payloadRows = imported.map((row, index) => {
        const line = index + 2
        const supplier = supplierByName.get(normalize(row['매입처']))
        if (!supplier) throw new Error(`${line}행: 등록된 매입처를 찾을 수 없습니다.`)
        const categoryText = normalize(row['구분'])
        const category = categoryText === '원재료' || categoryText === 'raw_material' ? 'RAW_MATERIAL' : categoryText === '부재료' || categoryText === 'packaging' ? 'PACKAGING' : ''
        if (!category) throw new Error(`${line}행: 구분은 원재료 또는 부재료여야 합니다.`)
        const material = category === 'RAW_MATERIAL' ? rawByName.get(normalize(row['품목'])) : packagingByName.get(normalize(row['품목']))
        if (!material) throw new Error(`${line}행: 등록된 품목을 찾을 수 없습니다.`)
        const quantity = Number(row['수량'])
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`${line}행: 수량을 확인해 주세요.`)
        const unit = category === 'PACKAGING' ? 'EA' : String(row['단위'] || 'KG').trim().toUpperCase()
        const unitPrice = Number(row['단가'] || 0)
        const supplyAmount = row['공급가액'] === '' ? quantity * unitPrice : Number(row['공급가액'])
        const vatAmount = Number(row['부가세'] || 0)
        if (![unitPrice, supplyAmount, vatAmount].every(Number.isFinite)) throw new Error(`${line}행: 금액을 확인해 주세요.`)
        const method = paymentCode(row['결제수단']) || supplier.default_payment_method
        const account = String(row['계좌/카드'] || '').trim()
        return {
          supplier_id: supplier.id,
          purchase_category: category,
          material_id: material.id,
          quantity,
          unit,
          purchase_date: excelDate(row['매입일']) || initialToday,
          receipt_date: excelDate(row['입고일']) || excelDate(row['매입일']) || initialToday,
          unit_price: unitPrice,
          supply_amount: supplyAmount,
          vat_amount: vatAmount,
          total_amount: supplyAmount + vatAmount,
          due_date: excelDate(row['지급예정일']),
          planned_payment_method: method,
          planned_payment_account: method === 'CARD' ? '' : account,
          planned_card_name: method === 'CARD' ? account : '',
          planned_installment_months: Math.max(1, Number(row['할부개월'] || supplier.default_installment_months || 1)),
          tax_invoice_status: supplier.tax_invoice_required ? 'NOT_RECEIVED' : 'NOT_REQUIRED',
          notes: String(row['비고'] || '').trim(),
        }
      })

      const response = await fetch('/api/moni/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_purchase_batch', rows: payloadRows }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '엑셀 등록에 실패했습니다.')
      setMessage(`${result.created_count ?? payloadRows.length}건을 등록했습니다.`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '엑셀 등록에 실패했습니다.')
    } finally {
      setExcelBusy(false)
    }
  }

  const filterButtons: Array<[DateMode, string]> = [['MONTH', '월별'], ['DATE', '특정일'], ['RANGE', '기간'], ['ALL', '전체']]

  return (
    <main data-purchase-receipt-management className="min-h-screen bg-[linear-gradient(145deg,#f6fbff,#e7f2fc)] p-5 text-[#173b52] lg:p-9">
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-[28px] border border-sky-100 bg-white/95 p-7 shadow-xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div><div className="text-xs font-black tracking-[0.18em] text-sky-700">PURCHASE · RECEIPT</div><h1 className="mt-2 text-3xl font-black">매입·입고 관리</h1><p className="mt-2 text-sm text-[#627f91]">입고내역 수정·삭제 시 수불부와 현재고도 즉시 함께 변경됩니다.</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={openCreate} className="pr-primary">+ 매입·입고 등록</button><button type="button" onClick={() => void downloadTemplate()} className="pr-secondary">엑셀 템플릿</button><label className={`pr-secondary cursor-pointer ${excelBusy ? 'pointer-events-none opacity-60' : ''}`}>{excelBusy ? '등록 중...' : '엑셀 일괄 등록'}<input type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => void importExcel(event)} /></label><button type="button" onClick={() => void load()} className="pr-secondary">새로고침</button></div>
          </div>
        </header>

        <div className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-sky-100 bg-white/90 p-2 shadow-lg">
          <button type="button" onClick={() => onNavigate('suppliers')} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-[#36586d]">매입처 관리</button>
          <button type="button" className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-black text-white">매입·입고 관리</button>
          <button type="button" onClick={() => onNavigate('payables')} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-[#36586d]">지급·미지급금</button>
        </div>

        {error ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">{error}</div> : null}
        {message ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-6 overflow-hidden rounded-[28px] border border-sky-100 bg-white/95 shadow-xl">
          <div className="flex flex-col gap-3 border-b border-sky-100 px-7 py-5 xl:flex-row xl:items-center xl:justify-between"><h2 className="text-xl font-black">매입·입고 내역</h2><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="매입처·품목 검색" className="h-11 w-full max-w-[320px] rounded-xl border border-sky-100 bg-white px-4 text-sm outline-none" /></div>
          <div className="border-b border-sky-100 bg-white px-7 py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div><div className="mb-2 text-xs font-black text-[#607d8d]">입고일 조회</div><div className="flex flex-wrap gap-2">{filterButtons.map(([key, title]) => <button key={key} type="button" onClick={() => setDateMode(key)} className={`rounded-xl border px-4 py-2 text-sm font-black ${dateMode === key ? 'border-sky-700 bg-sky-700 text-white' : 'border-sky-100 bg-white text-[#36586d]'}`}>{title}</button>)}</div></div>
              <div className="flex flex-wrap items-end gap-3">
                {dateMode === 'MONTH' ? <label><span className="mb-1.5 block text-xs font-black text-[#607d8d]">조회 월</span><input type="month" className="pr-input min-w-[160px]" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /></label> : null}
                {dateMode === 'DATE' ? <label><span className="mb-1.5 block text-xs font-black text-[#607d8d]">조회 일자</span><input type="date" className="pr-input min-w-[160px]" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label> : null}
                {dateMode === 'RANGE' ? <><label><span className="mb-1.5 block text-xs font-black text-[#607d8d]">시작일</span><input type="date" className="pr-input min-w-[160px]" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label><span className="mb-1.5 block text-xs font-black text-[#607d8d]">종료일</span><input type="date" className="pr-input min-w-[160px]" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></> : null}
                <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-black text-sky-900">전체 {searchedRows.length.toLocaleString('ko-KR')}건 · 표시 {filteredRows.length.toLocaleString('ko-KR')}건</div>
              </div>
            </div>
          </div>
          {loading ? <div className="p-16 text-center font-black">불러오는 중입니다.</div> : <ReceiptHistoryTable rows={filteredRows} onEdit={openEdit} onDelete={deleteReceipt} onTax={updateTax} />}
        </section>
      </div>

      {editorOpen ? <ReceiptEditorModal editing={editing} draft={draft} setDraft={setDraft} suppliers={suppliers} rawMaterials={rawMaterials} packagingMaterials={packagingMaterials} busy={busy} onClose={() => setEditorOpen(false)} onSave={() => void saveReceipt()} /> : null}

      <style jsx global>{`
        [data-purchase-receipt-management] .pr-input{height:44px;width:100%;border-radius:12px;border:1px solid #cfdee7;background:white;padding:0 14px;font-size:14px;outline:none;color:#173b52}
        [data-purchase-receipt-management] .pr-input:focus{border-color:#0284c7;box-shadow:0 0 0 3px rgba(2,132,199,.08)}
        [data-purchase-receipt-management] .pr-input:disabled{background:#eef3f6;color:#6f8795}
        [data-purchase-receipt-management] .pr-primary{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;background:#0369a1;padding:11px 20px;font-size:14px;font-weight:900;color:white}
        [data-purchase-receipt-management] .pr-primary:disabled{opacity:.55}
        [data-purchase-receipt-management] .pr-secondary{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid #bae6fd;background:white;padding:10px 16px;font-size:13px;font-weight:900;color:#075985}
      `}</style>
    </main>
  )
}
