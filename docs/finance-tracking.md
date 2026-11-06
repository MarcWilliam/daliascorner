# Finance workflow

Use **Orders → Details → Payments** to record money actually received or refunded: amount, original Cairo date, reference and reason. Partial amounts are supported. The UI does not charge or transfer money. Item, delivery and replacement changes update the obligation and show money due/refund due; they never fabricate cash. See [order adjustments](order-adjustments.md) for fulfilment and correction rules. Legacy full-status endpoints remain restricted to untouched legacy orders and cannot bypass managed cash records.

Record actual business outgoings in **Expenses → Add expense**: amount, category, date paid; note is optional. Use **Stock purchases** for buying inventory, and the other categories for advertising, carrier charges, packaging and overhead. Use **Edit** to correct amount, category, date and note; an immutable change history is retained. Existing excluded entries keep their exclusion status. Exact retries reuse an idempotency key and cannot duplicate the same expense. The register supports date/category/status/note filters and pagination; displayed totals cover the entire filtered result, not just the current page. Switching to **Financial report** preserves an unsaved expense draft.

**Financial report** contains period-based cash/profit summaries, missing order costs and the payment/refund history. Expense entry and management live on the separate Expenses page.

Set a product’s optional **Unit cost** in **Products & stock** before new orders are placed. Each order item receives a private cost snapshot at order creation. Changing the current product cost affects future orders only. Costs missing at order time can be completed once under **Finances → Complete missing product costs**, using the original cost for that order. Unknown costs remain unknown; zero is allowed only when deliberately entered. Customer order APIs do not expose these costs.

## What the figures mean

- **Net money collected** = recorded receipts − refunds − paid-status corrections. Delivery collected is included.
- **Cash spent** = all active expense entries, including stock purchases.
- **Tracked cash balance** = net money collected − cash spent. It is the movement represented by these records, not a bank-account balance or opening cash balance.
- **Gross profit estimate** = net money collected − recognized cost-event quantities × their original cost snapshots.
- **Profit estimate** = gross profit estimate − operating expenses. Stock purchase expenses are excluded here because product costs are already counted; subtracting both would count inventory twice.
- **Estimated margins** = the corresponding profit estimate ÷ net money collected × 100. Margins are unavailable when net receipts are zero/negative or a required product cost is missing. Profit estimates are also unavailable when a required cost is missing.

This is a cash/product-cost management estimate, not an accrual, statutory or tax report. Managed payments use their manually entered effective Cairo date; date corrections retain the original date and append a correction. Past-order imports use the explicitly entered original payment date in Cairo time; their audit recording time remains the current time. Incomplete or omitted expenses affect the estimate. The total includes delivery receipts; carrier fees must be recorded as expenses. New orders snapshot configured costs; historical imports use only entered original costs or unknown values rather than today's costs.

Refunds reduce cash in their effective period. Managed product costs enter when units ship and reverse only for explicitly restocked returns. Damaged/non-restocked returns retain their product cost. Remaining reservations are released after each shipment without removing the outstanding units. Carrier bills and other shipping costs must be recorded as expenses.

Date filters are inclusive calendar dates in **Africa/Cairo**. Existing legacy cost movements retain their original payment-linked dates. Promoting an earlier order records a cost-policy adjustment at promotion time before applying new fulfilment events; it does not move money. New website/chat orders enter managed costing at creation, so a paid unshipped chat order recognizes no product cost yet. Historical imports retain their earlier accounting until explicitly adjusted. Report history uses corrected effective cash dates and preserves original receipts/correction history.

## Existing records and access

Tracking starts when the migration runs. Existing **Paid** flags become undated opening paid balances shown only under **All time**; historical product costs are initially unknown. Explicit **Past delivered order** entries can add original dated payments before that start date. Original calendar dates are stored at noon Cairo time to avoid daylight-saving transition ambiguity; this is a date-only convention, not a claimed time of payment. Earlier refunded orders are excluded from reconstructed history and the panel displays their count when applicable. Existing unpaid orders do not create receipts until marked paid. Do not interpret filtered periods as reconstructed bank history.

Finance tables allow only admin reads via RLS; all browser writes use RPCs that verify `is_admin()`. Cost snapshots live separately from customer-readable order items, with no customer cost policy. Current product costs can be edited by admins; recorded known order costs are immutable through browser APIs. Service-role database access retains privileged operational access. No secret credentials are required by the frontend.
