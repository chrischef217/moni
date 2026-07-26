# Export shipment → Sales Management integration

## Confirmed operating flow

1. Export Destination Management is the master entry point for export customers.
2. Saving an export destination creates or updates a linked `sales_clients` customer.
3. The export customer link is stored in `export_destinations.sales_client_id`.
4. Clicking `출고확정/거래명세표 인쇄` performs the shipment confirmation through `/api/moni/export-shipment`.
5. Shipment confirmation creates one idempotent `sales_orders` record with:
   - `source_type = EXPORT`
   - `source_reference = export_documents.id`
   - `status = confirmed`
   - `vat_rate = 0`
   - `vat_amount = 0`
   - the export document currency
   - an automatically generated `DB-YYYYMMDD-NNN` transaction-statement number
6. Export products are copied into `sales_order_items` as CTN snapshot lines. The original finished-product link is preserved in `source_product_id` while `product_id` remains null so the finished-goods inventory does not deduct the same export shipment twice.
7. The export document stores the linked sales order in `export_documents.sales_order_id` and changes to `SHIPPED` only after the sales record has been created successfully.
8. Immediately after successful confirmation, the export transaction statement route opens with auto-print.
9. The transaction statement shows the export customer, Invoice/Packing references, HS CODE, CTN quantity, unit price, amount, currency, and VAT 0%.
10. A shipped export document exposes transaction-statement reprint from Export Document Management.
11. Sales Management > 거래명세표 also detects export-origin sales orders and routes their Print action to the export transaction-statement print view.
12. Shipment cancellation cancels the linked sales order and restores inventory through the existing source-data recalculation policy. Cancellation is blocked if a posted receipt already exists for the linked sales order.

## Inventory rule

Export inventory deduction remains controlled by `export_documents.status = SHIPPED`. The auto-created Sales Management line stores the true product relationship in `source_product_id` rather than `product_id`, preventing the existing sales inventory path from double-counting the same outbound shipment.
