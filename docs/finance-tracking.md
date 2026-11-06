# Finance workflow

Mark an order **Paid** only when the money is received. This records a payment for the full order total, including delivery. **Refunded** records a full refund of a previously paid order. Changing **Paid → Unpaid** is a correction of a mistaken paid flag; it reverses the receipt and recognized product costs. This panel does not support partial payments or partial refunds.

Record actual business outgoings in **Expenses → Add expense**: amount, category, date paid; note is optional. Use **Stock purchases** for buying inventory, and the other categories for advertising, carrier charges, packaging and overhead. Entries can be voided to correct mistakes; they remain in the register. Exact retries reuse an idempotency key and cannot duplicate the same expense. The register supports date/category/status/note filters and pagination; displayed totals cover the entire filtered result, not just the current page. Switching to **Financial report** preserves an unsaved expense draft.

**Financial report** contains period-based cash/profit summaries, missing order costs and the payment/refund history. Expense entry and management live on the separate Expenses page.

Set a product’s optional **Unit cost** in **Products & stock** before new orders are placed. Each order item receives a private cost snapshot at order creation. Changing the current product cost affects future orders only. Costs missing at order time can be completed once under **Finances → Complete missing product costs**, using the original cost for that order. Unknown costs remain unknown; zero is allowed only when deliberately entered. Customer order APIs do not expose these costs.

## What the figures mean

- **Net money collected** = recorded full-order payments − full refunds − paid-status corrections. Delivery collected is included.
- **Cash spent** = all active expense entries, including stock purchases.
- **Tracked cash balance** = net money collected − cash spent. It is the movement represented by these records, not a bank-account balance or opening cash balance.
- **Gross profit estimate** = net money collected − cost snapshots × paid-order quantities.
- **Paid-order profit estimate** = gross profit estimate − operating expenses. Stock purchase expenses are excluded here because product costs are already counted; subtracting both would count inventory twice.
- **Estimated margins** = the corresponding profit estimate ÷ net money collected × 100. Margins are unavailable when net receipts are zero/negative or a required product cost is missing. Profit estimates are also unavailable when a required cost is missing.

This is a paid-order management estimate, not an accrual, statutory or tax report. Ordinary payment dates are the time an admin changes the payment status. Past-order imports use the explicitly entered original payment date in Cairo time; their audit recording time remains the current time. Incomplete or omitted expenses affect the estimate. The total includes delivery receipts; carrier fees must be recorded as expenses. New orders snapshot configured costs; historical imports use only entered original costs or unknown values rather than today's costs.

Refunds reduce receipts in their refund period. They retain product costs: a refund alone does not establish whether returned goods are reusable. Return-cost recovery/resale accounting is not modeled, so returned-stock situations need accounting reconciliation outside this estimate.

Date filters are inclusive calendar dates in **Africa/Cairo** (including timezone changes). Cash entries use their manually entered paid date. An order’s product cost enters the estimate with its first recorded payment; a mistaken-payment correction reverses it. Repeated clicks on the same payment status do not add duplicate events. A refunded order marked paid again does not recognize its original cost twice.

## Existing records and access

Tracking starts when the migration runs. Existing **Paid** flags become undated opening paid balances shown only under **All time**; historical product costs are initially unknown. Explicit **Past delivered order** entries can add original dated payments before that start date. Original calendar dates are stored at noon Cairo time to avoid daylight-saving transition ambiguity; this is a date-only convention, not a claimed time of payment. Earlier refunded orders are excluded from reconstructed history and the panel displays their count when applicable. Existing unpaid orders do not create receipts until marked paid. Do not interpret filtered periods as reconstructed bank history.

Finance tables allow only admin reads via RLS; all browser writes use RPCs that verify `is_admin()`. Cost snapshots live separately from customer-readable order items, with no customer cost policy. Current product costs can be edited by admins; recorded known order costs are immutable through browser APIs. Service-role database access retains privileged operational access. No secret credentials are required by the frontend.
