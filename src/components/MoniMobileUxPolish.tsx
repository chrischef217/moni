'use client'

export default function MoniMobileUxPolish() {
  return (
    <style jsx global>{`
      [data-moni-mobile-chat] .ml-10.rounded-2xl {
        border: 1px solid #c7e8df !important;
        background: #def5ee !important;
        color: #173b52 !important;
        box-shadow: 0 4px 14px rgba(23, 59, 82, 0.035) !important;
      }
      [data-moni-mobile-chat] .moni-markdown table {
        scrollbar-width: thin;
        scrollbar-color: #b7d9d1 transparent;
      }
      [data-moni-mobile-chat] .moni-markdown table::-webkit-scrollbar { height: 5px; }
      [data-moni-mobile-chat] .moni-markdown table::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: #b7d9d1;
      }
      [data-moni-mobile-chat] .moni-markdown a[href*="/api/moni/answer-pdf"],
      [data-moni-mobile-chat] .moni-markdown a[href*="/api/moni/sales-statement-pdf"],
      [data-moni-mobile-chat] .moni-markdown a[href*="/sales-management/"] {
        display: inline-flex;
        align-items: center;
        min-height: 38px;
        margin: 5px 4px 3px 0;
        padding: 8px 12px;
        border: 1px solid #cce8e1;
        border-radius: 12px;
        background: #f2fbf8;
        color: #167e6b;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.25;
        text-decoration: none;
      }
      [data-moni-mobile-chat] .moni-markdown a[href*="/api/moni/answer-pdf"]:active,
      [data-moni-mobile-chat] .moni-markdown a[href*="/api/moni/sales-statement-pdf"]:active,
      [data-moni-mobile-chat] .moni-markdown a[href*="/sales-management/"]:active {
        transform: scale(.98);
      }
    `}</style>
  )
}
