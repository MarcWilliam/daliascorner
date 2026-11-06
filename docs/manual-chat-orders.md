# Orders received in chat

In **Admin → Orders → Add chat order**, select catalog products and quantities, enter customer/delivery details, choose an active delivery zone and payment method, then save.

- Prices and delivery fees come from the configured catalog and delivery zones. There are no price overrides.
- New chat orders start **Confirmed / Unpaid** and reserve tracked stock. Unlimited products follow their existing mode. Confirmed orders do not expire automatically.
- Select **Payment already received** only after receiving the full total. This records the receipt in Finance after delivery fees and costs have been snapshotted. Unknown product costs keep profit estimates incomplete until completed in Finance.
- Shipping, delivery, cancellation, payment correction and refunds use the existing order controls and stock/finance rules.
- Orders show **Chat order** or **Website order**, with a source filter in the order list.
- The saved receipt provides a private tracking link to copy and share with the customer. It is a possession-based link; keep it private. Customers can sign in to attach the order to their own account. Admin previews do not attach customer orders to the admin account.
- Chat orders are recorded without website advertising consent and do not generate website Meta conversion events. Normal new-order/low-stock notifications remain connected.

This entry flow records newly agreed chat orders now. It does not backdate completed sales, import chat history, or change prices to reconstruct older totals. Original-date historical entry is a separate decision; using this form for an old fulfilled order would reserve stock again.

Saving is admin-only and transactional. Exact retries retain the same identifiers and return the current order without repeating reservations, receipts or notifications; changed content starts a fresh attempt. Client retry state is scoped to the admin. Drafts survive admin tab and language changes.

## Verification

Local browser checks covered mobile and desktop entry in English/Arabic, draft preservation, simulated failure with retained data, retry, paid receipt and source filtering. Database tests cover role restrictions, finite/unlimited stock, catalog/fee/cost snapshots, optional full payment, private tracking, exactly-once retry, shipping/cancellation, confirmed non-expiry and atomic rollback on invalid baskets.

The hosted RPC also passed a rolled-back transaction checking current configured totals, stock reservation, paid finance, private tracking, retry reuse and absence of Meta events. No chat test order, stock hold, receipt or phone alert was retained from that hosted check.

The complete suite passes **67 tests**, and the production static export builds with Node 22.23.1. Public API checks deny anonymous chat-order creation.
