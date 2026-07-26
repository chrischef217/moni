'use client'

export default function ExportDocumentsListPolish() {
  return <>
    <span data-export-document-list-polish hidden />
    <style jsx global>{`
      body:has([data-export-document-list-polish]) main table th:nth-child(8),
      body:has([data-export-document-list-polish]) main table td:nth-child(8) {
        width: 92px !important;
        min-width: 92px !important;
        text-align: center !important;
        white-space: nowrap !important;
      }

      body:has([data-export-document-list-polish]) main table td:nth-child(8) > span {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: max-content !important;
        white-space: nowrap !important;
        word-break: keep-all !important;
      }

      body:has([data-export-document-list-polish]) main table th:nth-child(9),
      body:has([data-export-document-list-polish]) main table td:nth-child(9) {
        width: 292px !important;
        min-width: 292px !important;
        text-align: center !important;
      }

      body:has([data-export-document-list-polish]) main table td:nth-child(9) > div:has(button[class*='border-[#c8d9e3]']) {
        display: grid !important;
        grid-template-columns: repeat(3, max-content) !important;
        grid-auto-flow: row !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 7px !important;
      }

      body:has([data-export-document-list-polish]) main table td:nth-child(9) button {
        min-width: 0 !important;
        white-space: nowrap !important;
        word-break: keep-all !important;
      }

      /* First row: Invoice · Packing · shipment action */
      body:has([data-export-document-list-polish]) main table td:nth-child(9) button[class*='border-[#c8d9e3]'] {
        order: 1 !important;
      }

      body:has([data-export-document-list-polish]) main table td:nth-child(9) button[class*='bg-[#16b981]'],
      body:has([data-export-document-list-polish]) main table td:nth-child(9) button[class*='bg-[#fff7f7]'][class*='border-[#efc0c4]'] {
        order: 2 !important;
      }

      /* Second row: PDF/Print · Edit · Delete */
      body:has([data-export-document-list-polish]) main table td:nth-child(9) button[class*='bg-[#315d75]'] {
        order: 3 !important;
        color: #fff !important;
      }

      body:has([data-export-document-list-polish]) main table td:nth-child(9) button[class*='bg-[#315d75]'] * {
        color: #fff !important;
      }

      body:has([data-export-document-list-polish]) main table td:nth-child(9) button[class*='border-[#bfd5e1]'] {
        order: 4 !important;
      }

      body:has([data-export-document-list-polish]) main table td:nth-child(9) button[class*='border-[#efc0c4]'][class*='bg-white'] {
        order: 5 !important;
      }
    `}</style>
  </>
}
