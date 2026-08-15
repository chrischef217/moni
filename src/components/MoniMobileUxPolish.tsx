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
    `}</style>
  )
}
