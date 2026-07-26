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

        body:has([data-export-document-print-runtime]) .paper {
          position: relative !important;
          inset: auto !important;
          display: block !important;
          box-sizing: border-box !important;
          width: 210mm !important;
          min-height: 297mm !important;
          height: auto !important;
          margin: 0 !important;
          overflow: visible !important;
          box-shadow: none !important;
          break-before: auto !important;
          page-break-before: auto !important;
          break-after: page !important;
          page-break-after: always !important;
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
