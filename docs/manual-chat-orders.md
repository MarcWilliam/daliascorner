# Orders received in chat

In **Admin → Orders → Add chat order**, choose **New order** or **Past delivered order**, then select catalog products, quantities, customer details and delivery/payment information.

- Prices and delivery fees come from the configured catalog and delivery zones. There are no price overrides.
- New chat orders start **Confirmed / Unpaid** and reserve tracked stock. Unlimited products follow their existing mode. Confirmed orders do not expire automatically.
- Select **Payment already received** only after receiving the full total. This records the receipt in Finance after delivery fees and costs have been snapshotted. Unknown product costs keep profit estimates incomplete until completed in Finance.
- Shipping, delivery, cancellation, payment correction and refunds use the existing order controls and stock/finance rules.
- Orders show **Chat order** or **Website order**, with a source filter in the order list.
- The saved receipt provides a private tracking link to copy and share with the customer. It is a possession-based link; keep it private. Customers can sign in to attach the order to their own account. Admin previews do not attach customer orders to the admin account.
- Chat orders are recorded without website advertising consent and do not generate website Meta conversion events. Normal new-order/low-stock notifications remain connected.

## Past delivered orders

Use **Past delivered order** for an older fulfilled sale. It saves as Delivered, with the explicitly selected original order date. If paid, select the original payment date separately; Finance reports the receipt and original item costs in that payment period. Both dates use Cairo calendar days, cannot be in the future, and payment cannot precede the order. The actual recording timestamp remains available for audit; admin lists sort by recording time so a newly entered past sale stays easy to find.

Stock handling defaults to **Already accounted for**. This leaves today's stock and reservations untouched. Choose **Deduct tracked stock now** only if those pieces have not already been removed from the current count. This deduction happens once, cannot consume stock reserved for other orders, and skips unlimited products. It can generate a current low-stock alert. Past entries create no new-order alert and no Meta conversion.

Original cost per unit is optional for each line. Blank is unknown; an explicitly entered zero is known. Today's configured product cost is never silently used for an old sale. Missing original costs keep the profit estimate incomplete until filled in Finance.

Prices and fees still use the current configured catalog, as requested. Confirm that these match the original sale before saving; the backend rejects a stale displayed total. If the original charged amounts differ, this flow cannot reconstruct that sale using price overrides. Configured inactive products/zones and currently disabled payment methods remain available for historical evidence. No chat messages are imported automatically, and original historical refund events are not reconstructed by this entry mode.

Original dates are stored at noon Cairo time to represent the calendar day across daylight-saving changes; the application displays dates, not a claimed original time of day. Customers see the original order date, while admin also sees when the record was entered.

Saving is admin-only and transactional. Exact retries retain the same identifiers and return the current order without repeating reservations, receipts or notifications; changed content starts a fresh attempt. Client retry state is scoped to the admin. Drafts survive admin tab and language changes.

## Verification

Local browser checks covered mobile and desktop entry in English/Arabic, draft preservation, simulated failure with retained data, retry, paid receipt and source filtering. Database tests cover role restrictions, finite/unlimited stock, catalog/fee/cost snapshots, optional full payment, private tracking, exactly-once retry, shipping/cancellation, confirmed non-expiry and atomic rollback on invalid baskets.

The hosted RPC also passed a rolled-back transaction checking current configured totals, stock reservation, paid finance, private tracking, retry reuse and absence of Meta events. No chat test order, stock hold, receipt or phone alert was retained from that hosted check.

Historical tests also cover original financial periods, original/unknown costs, both stock-handling modes, inactive catalog configuration, date/total validation, duplicate retries and rollback. The full local suite passes **76 tests** and the production static export builds. Local browser checks confirmed October income for an October payment, no stock changes for already-accounted items, invalidated price confirmation after quantity changes, and retained original dates in narrow Arabic layouts. Public API checks include denial of anonymous order creation after migration deployment.

The approved historical migration is applied. Hosted rolled-back checks passed both stock modes (including existing held quantities), original/unknown costs, original payment dates, recording timestamps, inactive configured catalog/zone, private tracking, and unchanged retries. No historical QA product/order, notification or advertising event was retained.
