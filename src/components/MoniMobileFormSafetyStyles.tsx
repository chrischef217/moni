'use client'

export default function MoniMobileFormSafetyStyles() {
  return <style jsx global>{`
    .moni-crud-card,
    .moni-pc-card {
      box-sizing: border-box !important;
      width: min(100%, 720px) !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }
    .moni-crud-card *,
    .moni-pc-card * {
      box-sizing: border-box;
    }
    .moni-crud-grid,
    .moni-pc-grid {
      min-width: 0;
      max-width: 100%;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .moni-crud-field,
    .moni-pc-grid label,
    .moni-biz-item,
    .moni-biz-search,
    .moni-pc-search {
      min-width: 0 !important;
      max-width: 100% !important;
    }
    .moni-crud-field input,
    .moni-crud-field select,
    .moni-biz-item > input,
    .moni-biz-search > input,
    .moni-pc-grid input,
    .moni-pc-grid textarea,
    .moni-pc-grid select,
    .moni-pc-search > input {
      display: block;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }
    @media (max-width: 520px) {
      .moni-pc-grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .moni-pc-grid .wide {
        grid-column: auto;
      }
    }
    @media (max-width: 360px) {
      .moni-crud-grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .moni-crud-span-2 {
        grid-column: auto;
      }
    }
  `}</style>
}
