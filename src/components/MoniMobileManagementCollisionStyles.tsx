export default function MoniMobileManagementCollisionStyles() {
  return <style>{`
    [data-moni-mobile-chat][data-moni-management-active="true"] .moni-sales-statement-host,
    [data-moni-mobile-chat][data-moni-management-active="true"] .moni-sales-export-bundle-host,
    [data-moni-mobile-chat][data-moni-management-active="true"] .moni-purchase-card-host,
    [data-moni-mobile-chat][data-moni-management-active="true"] .moni-raw-material-card-host {
      display: none !important;
    }
  `}</style>
}
