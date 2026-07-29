'use client'

export default function PurchaseDesignConsistencyController() {
  return (
    <style jsx global>{`
      [data-purchase-receipt-management] {
        min-height: 100vh !important;
        background: #f3f6f8 !important;
        padding: 24px !important;
        color: #173b52 !important;
      }

      [data-purchase-receipt-management] > div {
        max-width: 1700px !important;
        overflow: hidden !important;
        border: 1px solid #d6e4ec !important;
        border-radius: 22px !important;
        background: #fff !important;
        box-shadow: 0 14px 38px rgba(29, 62, 82, 0.12) !important;
      }

      [data-purchase-receipt-management] header {
        margin: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: #fff !important;
        padding: 30px 36px 20px !important;
        box-shadow: none !important;
      }

      [data-purchase-receipt-management] header .tracking-\[0\.18em\] {
        display: none !important;
      }

      [data-purchase-receipt-management] header h1 {
        margin-top: 0 !important;
        font-size: 26px !important;
        line-height: 1.25 !important;
        letter-spacing: -0.03em !important;
      }

      [data-purchase-receipt-management] header p {
        margin-top: 8px !important;
        font-size: 14px !important;
        color: #657f90 !important;
      }

      [data-purchase-receipt-management] > div > div.mt-6 {
        width: calc(100% - 72px) !important;
        max-width: 650px !important;
        margin: 0 36px 22px !important;
        gap: 0 !important;
        border: 1px solid #cfe0ea !important;
        border-radius: 20px !important;
        background: #f2f7fa !important;
        padding: 6px !important;
        box-shadow: 0 8px 18px rgba(31, 67, 89, 0.06) !important;
      }

      [data-purchase-receipt-management] > div > div.mt-6 > button {
        flex: 1 1 0 !important;
        border-radius: 15px !important;
        padding: 12px 14px !important;
        font-size: 14px !important;
        color: #415f72 !important;
        background: transparent !important;
      }

      [data-purchase-receipt-management] > div > div.mt-6 > button:nth-child(2) {
        color: #fff !important;
        background: #20c77a !important;
        box-shadow: 0 8px 18px rgba(32, 199, 122, 0.24) !important;
      }

      [data-purchase-receipt-management] section {
        margin: 0 !important;
        border: 0 !important;
        border-top: 1px solid #e4edf2 !important;
        border-radius: 0 !important;
        background: #fff !important;
        box-shadow: none !important;
      }

      [data-purchase-receipt-management] section > div:first-child {
        border-color: #e4edf2 !important;
        padding: 20px 36px !important;
      }

      [data-purchase-receipt-management] section > div:nth-child(2) {
        border-color: #e4edf2 !important;
        background: #f8fafb !important;
        padding: 18px 36px !important;
      }

      [data-purchase-receipt-management] section h2 {
        font-size: 20px !important;
        letter-spacing: -0.02em !important;
      }

      [data-purchase-receipt-management] .pr-input,
      [data-purchase-receipt-management] section input {
        height: 48px !important;
        border: 1px solid #d2e1ea !important;
        border-radius: 14px !important;
        background: #fff !important;
        font-size: 14px !important;
        font-weight: 700 !important;
        color: #173b52 !important;
      }

      [data-purchase-receipt-management] .pr-input:focus,
      [data-purchase-receipt-management] section input:focus {
        border-color: #20c77a !important;
        box-shadow: 0 0 0 3px rgba(32, 199, 122, 0.11) !important;
      }

      [data-purchase-receipt-management] .pr-primary {
        min-height: 44px !important;
        border-radius: 13px !important;
        background: #20c77a !important;
        padding: 0 19px !important;
        font-size: 13px !important;
        box-shadow: 0 8px 18px rgba(32, 199, 122, 0.18) !important;
      }

      [data-purchase-receipt-management] .pr-secondary {
        min-height: 44px !important;
        border: 1px solid #d2e1ea !important;
        border-radius: 13px !important;
        background: #fff !important;
        padding: 0 16px !important;
        font-size: 13px !important;
        color: #24485f !important;
      }

      [data-purchase-receipt-management] section button.bg-sky-700 {
        border-color: #20c77a !important;
        background: #20c77a !important;
        color: #fff !important;
      }

      [data-purchase-receipt-management] table {
        font-size: 14px !important;
      }

      [data-purchase-receipt-management] thead {
        background: #edf5fa !important;
        color: #5f7a8c !important;
      }

      [data-purchase-receipt-management] thead th {
        padding-top: 16px !important;
        padding-bottom: 16px !important;
        font-size: 12px !important;
      }

      [data-purchase-receipt-management] tbody {
        color: #173b52 !important;
      }

      [data-purchase-receipt-management] tbody tr {
        border-color: #e7eef2 !important;
      }

      [data-purchase-receipt-management] tbody tr:hover {
        background: #fbfdfd !important;
      }

      @media (max-width: 900px) {
        [data-purchase-receipt-management] {
          padding: 12px !important;
        }

        [data-purchase-receipt-management] header {
          padding: 24px 20px 18px !important;
        }

        [data-purchase-receipt-management] > div > div.mt-6 {
          width: calc(100% - 40px) !important;
          margin: 0 20px 18px !important;
        }
      }
    `}</style>
  )
}
