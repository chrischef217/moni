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
- Release validation: HS CODE master, KRW default currency, export-document snapshot, and print views are included in the production release.
- Latest export-document UI fix: status labels stay on one line; action buttons are locked to row 1 `Invoice / Packing / PDF·인쇄` and row 2 `출고확정(or 출고취소) / 수정 / 삭제`; PDF/print text stays white.
- Latest print fix: Chrome print preview explicitly prints `.invoice-paper` and `.packing-paper` despite the legacy global statement-print visibility rule, and document-number-based titles are used for PDF filenames.

## Export sales statement integration

- Registering or editing an export destination synchronizes it to Sales Management customer management.
- Confirming export shipment creates one idempotent Sales Management order with source type `EXPORT`.
- Export sales orders use VAT rate `0%`, VAT amount `0`, and preserve the export document currency.
- The shipment button creates the sales order and immediately opens the generated transaction statement print view.
- Generated transaction statements remain available from the export-document management row and from the Sales Management transaction-statement workflow.
- Shipment cancellation also cancels the linked sales order unless posted receipts already exist.
- Production release trigger: export customer sync, VAT-free sales registration, transaction-statement creation, reprint, and compact action layout.
- Action spacing release: top row uses three non-overlapping equal slots; the shipment/statement button is shortened and the compact edit/delete buttons use the remaining second-row width without expanding the management column.
