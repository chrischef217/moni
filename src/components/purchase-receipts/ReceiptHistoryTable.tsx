'use client'

import type { PurchaseReceipt } from './types'
import { integerNumber, label, monthDay, receiptDate, receiptQuantity, stateTone, totalGrams } from './utils'

function CategoryBadge({ category }: { category: string }) {
  const meta = category === 'RAW_MATERIAL'
    ? { symbol: '원', title: '원재료', style: 'border-blue-200 bg-blue-100 text-blue-800' }
    : category === 'PACKAGING'
      ? { symbol: '부', title: '부재료', style: 'border-emerald-200 bg-emerald-100 text-emerald-800' }
      : { symbol: '기', title: '기타', style: 'border-violet-200 bg-violet-100 text-violet-800' }
  return <span title={meta.title} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border text-base font-black ${meta.style}`}>{meta.symbol}</span>
}

type Props = {
  rows: PurchaseReceipt[]
  onEdit: (row: PurchaseReceipt) => void
  onDelete: (row: PurchaseReceipt) => void
  onTax: (row: PurchaseReceipt, status: string) => void
}

export default function ReceiptHistoryTable({ rows, onEdit, onDelete, onTax }: Props) {
  return (
    <div className="w-full overflow-x-hidden">
      <table className="w-full table-fixed text-left text-[13px]">
        <colgroup>
          <col className="w-[5%]" />
          <col className="w-[7%]" />
          <col className="w-[10%]" />
          <col className="w-[22%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="bg-[#eef5f9] text-xs font-black text-[#5c788a]">
          <tr>
            <th className="px-2 py-4 text-center">종류</th>
            <th className="px-2 py-4 text-center">입고일</th>
            <th className="px-3 py-4">매입처</th>
            <th className="px-3 py-4">품목</th>
            <th className="px-3 py-4">입고수량</th>
            <th className="px-3 py-4 text-right">총 매입량(g)</th>
            <th className="px-3 py-4">지급예정</th>
            <th className="px-2 py-4">세금계산서</th>
            <th className="px-2 py-4 text-center">수정·삭제</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e3edf3]">
          {rows.map((row) => {
            const grams = totalGrams(row)
            const reviewRequired = row.verification_status === 'REVIEW_REQUIRED'
            return (
              <tr key={row.id}>
                <td className="px-2 py-4 text-center"><CategoryBadge category={row.purchase_category} /></td>
                <td className="px-2 py-4 text-center text-base font-black tabular-nums">{monthDay(receiptDate(row))}</td>
                <td className="break-words px-3 py-4 font-bold leading-5">{row.supplier_name_snapshot || '-'}</td>
                <td className="break-words px-3 py-4 font-bold leading-5">{row.item_name}</td>
                <td className="break-words px-3 py-4 font-black">{receiptQuantity(row)}</td>
                <td className="px-3 py-4 text-right text-base font-black tabular-nums">{grams === null ? '-' : `${integerNumber(grams)}g`}</td>
                <td className="break-words px-3 py-4">
                  {row.legacy_record ? '-' : reviewRequired ? (
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">지급 확인 필요</span>
                  ) : (
                    <>
                      {row.due_date ? monthDay(row.due_date) : '미설정'}
                      <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${stateTone(row.payment_state)}`}>{label(row.payment_state)}</div>
                    </>
                  )}
                </td>
                <td className="px-2 py-4">
                  {row.legacy_record ? '-' : reviewRequired ? (
                    <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-[10px] font-black text-amber-800">확인 필요</span>
                  ) : (
                    <select
                      value={row.tax_invoice_status}
                      onChange={(event) => void onTax(row, event.target.value)}
                      className={`max-w-full rounded-lg border px-1.5 py-2 text-[11px] font-black ${stateTone(row.tax_invoice_status)}`}
                    >
                      <option value="NOT_REQUIRED">대상 아님</option>
                      <option value="NOT_RECEIVED">미수취</option>
                      <option value="RECEIVED">수취</option>
                      <option value="MATCHED">일치</option>
                      <option value="MISMATCH">불일치</option>
                    </select>
                  )}
                </td>
                <td className="px-2 py-4">
                  <div className="flex items-center justify-center gap-1.5">
                    <button type="button" onClick={() => onEdit(row)} className="min-w-0 flex-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-2 text-[11px] font-black text-sky-800">수정</button>
                    <button type="button" onClick={() => onDelete(row)} className="min-w-0 flex-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-[11px] font-black text-rose-700">삭제</button>
                  </div>
                </td>
              </tr>
            )
          })}
          {!rows.length ? <tr><td colSpan={9} className="px-6 py-16 text-center font-black">조회 조건에 해당하는 매입·입고 내역이 없습니다.</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}
