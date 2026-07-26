# Export document workflow

- Menu: 수출관리 > 수출서류 관리
- Commercial Invoice No.: `INV-YYYYMMDD-001`
- Packing List No.: `PL-YYYYMMDD-001`
- Consignee: selected from registered export destinations
- Bill To default: `SAME AS CONSIGNEE`
- Product lines: selected from export product settings; quantity is entered in CTN
- Export item HS CODE default: `2103.90-9090`, editable per export product
- Export item default currency: `KRW`; other currencies are selected with explicit buttons rather than the native dropdown
- HS CODE is snapshotted into each saved export-document item so later master edits do not rewrite issued documents
- Commercial Invoice and Packing List both print the saved HS CODE
- Default export price is inherited from the export product master; a document may override the price for that shipment only
- Company information and authorized signature are snapshotted from the administrator company profile when the document is saved
- Save creates a draft; Save + PDF/Print marks the document generated and opens the combined Commercial Invoice + Packing List print view
- Finished-goods inventory is deducted only after `출고확정`; cancelling the shipment restores the calculated stock balance
