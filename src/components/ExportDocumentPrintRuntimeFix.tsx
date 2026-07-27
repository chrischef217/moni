'use client'

import { useEffect } from 'react'

type PrintType = 'invoice' | 'packing' | 'both'

type ExportDocumentMeta = {
  invoice_no?: string
  packing_list_no?: string
}

function pdfTitle(document: ExportDocumentMeta, type: PrintType) {
  const invoiceNo = String(document.invoice_no || 'EXPORT').trim()
  const packingNo = String(document.packing_list_no || invoiceNo).trim()
  if (type === 'invoice') return `${invoiceNo}_INVOICE`
  if (type === 'packing') return `${packingNo}_PACKINGLIST`
  return `${invoiceNo}_INVOICE_PACKINGLIST`
}

async function waitForPrintableAssets() {
  try {
    if ('fonts' in document) await document.fonts.ready
  } catch {
    // Printing can continue even when the browser font readiness API is unavailable.
  }

  const pendingImages = Array.from(document.images).filter((image) => !image.complete)
  if (pendingImages.length) {
    await Promise.all(pendingImages.map((image) => new Promise<void>((resolve) => {
      const finish = () => resolve()
      image.addEventListener('load', finish, { once: true })
      image.addEventListener('error', finish, { once: true })
      window.setTimeout(finish, 1500)
    })))
  }

  await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())))
}

export default function ExportDocumentPrintRuntimeFix({
  id,
  type,
  autoPrint,
}: {
  id: string
  type: PrintType
  autoPrint: boolean
}) {
  useEffect(() => {
    let active = true
    const previousTitle = document.title

    const prepare = async () => {
      try {
        const response = await fetch(`/api/moni/export-documents?id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok || !payload.ok || !payload.document || !active) return

        document.title = pdfTitle(payload.document, type)
        if (!autoPrint) return

        await waitForPrintableAssets()
        if (!active) return
        window.setTimeout(() => {
          if (active) window.print()
        }, 120)
      } catch {
        // The visible print view already handles document loading errors.
      }
    }

    void prepare()
    return () => {
      active = false
      document.title = previousTitle
    }
  }, [autoPrint, id, type])

  return <>
    <span data-export-document-print-runtime hidden />
    <style jsx global>{`
      @media print {
        @page {
          size: A4 portrait;
          margin: 0;
        }

        html:has([data-export-document-print-runtime]),
        body:has([data-export-document-print-runtime]) {
          width: 100% !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        body:has([data-export-document-print-runtime]) * {
          visibility: hidden !important;
        }

        body:has([data-export-document-print-runtime]) .moni-weather-stage,
        body:has([data-export-document-print-runtime]) [data-moni-app-shell],
        body:has([data-export-document-print-runtime]) [data-moni-app-content] {
          position: static !important;
          inset: auto !important;
          width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: #fff !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          transform: none !important;
        }

        body:has([data-export-document-print-runtime]) [data-moni-global-sidebar],
        body:has([data-export-document-print-runtime]) .moni-weather-stage__veil,
        body:has([data-export-document-print-runtime]) .moni-weather-badge,
        body:has([data-export-document-print-runtime]) .print-toolbar,
        body:has([data-export-document-print-runtime]) [data-export-document-print-runtime] {
          display: none !important;
        }

        body:has([data-export-document-print-runtime]) .paper,
        body:has([data-export-document-print-runtime]) .paper * {
          visibility: visible !important;
        }

        /*
         * IMPORTANT: this runtime layer must use the same physical A4 sizing as the
         * shared invoice/packing print CSS. 196 mm + 7 mm left/right margins = 210 mm,
         * and 283 mm + 7 mm top/bottom margins = 297 mm. The previous 210 x 297 mm
         * minimum page plus content padding overflowed the physical A4 page and pushed
         * the signature block onto a second sheet on invoice-only/packing-only prints.
         */
        body:has([data-export-document-print-runtime]) .paper {
          position: relative !important;
          inset: auto !important;
          display: flex !important;
          flex-direction: column !important;
          box-sizing: border-box !important;
          width: 196mm !important;
          min-height: 283mm !important;
          height: auto !important;
          margin: 7mm auto !important;
          padding: 7mm 8mm !important;
          overflow: visible !important;
          background: #fff !important;
          box-shadow: none !important;
          transform: none !important;
          font-size: 9.1px !important;
          line-height: 1.22 !important;
          break-before: auto !important;
          page-break-before: auto !important;
          break-after: page !important;
          page-break-after: always !important;
        }

        body:has([data-export-document-print-runtime]) .signature {
          width: 54mm !important;
          margin: auto 0 0 auto !important;
          padding-top: 3mm !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        body:has([data-export-document-print-runtime]) .signature img {
          max-width: 43mm !important;
          max-height: 13mm !important;
          margin: 1.2mm auto 0 !important;
        }

        body:has([data-export-document-print-runtime]) .signature-placeholder {
          height: 13mm !important;
        }

        body:has([data-export-document-print-runtime]) .page-break {
          break-before: auto !important;
          page-break-before: auto !important;
        }

        body:has([data-export-document-print-runtime]) .paper:last-of-type {
          break-after: auto !important;
          page-break-after: auto !important;
        }
      }
    `}</style>
  </>
}
