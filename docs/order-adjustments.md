# Order adjustments implementation contract

Implemented on `codex/supabase-store-admin`; deployment verification follows the checks below.

## Confirmed owner rules

- Replacements use catalog prices and configured delivery fees. Record agreements made outside the application; show any resulting amount due or refund due.
- Each shipment releases all remaining reservations. Outstanding items remain on the order, unreserved; a later shipment checks stock again.
- Product cost is recognized when items ship. A refund alone does not reverse cost; only an explicitly restocked return reverses it.
- Payment/refund records track actual money only. Order edits, stock movements and WhatsApp drafts never transfer or invent money.

## Scope

Customer/contact/address/zone corrections; item and quantity changes, out-of-stock removals and catalog replacements; private notes and an actor/reason timeline; courier/tracking/delivery information and partial shipments; partial payments/refunds; explicit returns/exchanges/restocking; controlled recording corrections, reopening and hold extensions; original order/payment-date corrections.

## Shared API

Operations backend owns `admin_order_detail(p_id)` and `admin_order_action(p_id,p_revision,p_key,p_action,p_payload,p_reason)`. The detail contains order revision, item progress, shipments, returns, timeline, notes and finance. Mutations require admin membership, an expected revision, a retry key and an explanation. Retries are bound to actor and exact operation content.

New website/chat orders enter managed operations at creation. Existing orders enter managed operations explicitly on their first new mutation. Promotion backfills their counters from existing status and tracked reservations without repeating stock or money movements. Legacy mutation endpoints must not bypass managed-order checks. Customer views expose only order progress and customer financial balances; notes, costs and audit internals remain admin-only.

## Acceptance checks

- Atomic stock changes; never consume another order's reservations or lose finite holds after stock-mode changes.
- Partial shipment releases remainder; later shipments recheck availability. Removal/replacement never silently marks a remaining line fulfilled.
- Paid and shipped adjustments produce explicit obligation/stock/financial records, preserving historical prices and known costs.
- Mixed legacy/managed finance avoids duplicate payments and product costs. Historical report dates remain inspectable.
- Customer/anonymous access and role revocation remain enforced by database permissions and guards.
- Concurrency, retries, timeout recovery, audit, expiry, returns and undo are exercised in PostgreSQL tests and synthetic browser workflows before deployment.

Implementation and validation are complete; production publication is verified through the feature-branch deployment checks.

## Finance migration preflight

A legacy order marked refunded with no finance payment events has unknown pre-tracking cash history. The finance migration stops with `RECONCILE_LEGACY_REFUNDS_BEFORE_OPERATIONS` if any such rows exist. It does not fabricate opening receipts/refunds or reinterpret those rows as unpaid. Reconcile the actual records explicitly before retrying. Ordinary recorded refunds and undated opening-paid balances retain their existing treatment.

## Delivery fees and migration rules

Delivery fees remain charged after shipment unless an admin explicitly waives them on a fully returned order; this is available during the last return or afterward. No cash refund is invented. A changed zone uses its configured fee; contact-only edits preserve the accepted fee, including paused or unknown legacy routes. After dispatch, route changes require an explicit coordination acknowledgement.

The rollout uses one atomic migration with a preflight gate for refunded legacy orders lacking cash history. Such unknown balances require reconciliation rather than guessed receipts/refunds. Existing report dates are preserved; promotion to managed operations records a cost-basis adjustment at promotion time. New website/chat orders use shipment-based costs immediately; historical imports retain their original legacy accounting until explicitly adjusted.

Known dispatch dates are locked to protect return chronology and cost-event dates. Legacy unknown dates stay unknown unless verified and entered; completed legacy shipments cannot be delivered/undone again. Returned units are allocated to shipment lines and close fulfilment exactly once. Original customer links, account ownership, historical prices and known cost snapshots remain protected.

## Verification

The complete real-PostgreSQL local API scenario passed: recipient/zone changes; original dates; notes; partial receipts; split shipment and remainder release; catalog replacement/removal; full balance receipt; sellable/non-sellable returns; partial/final refunds; later shipments; delivery closure after returns; explicit fee waiver; payment-date correction; cancellation/reopening/hold extension; clerical shipment undo; customer-role/private-note protection.

Browser tests used that actual PGlite-backed API, not a simulated business-rule array. They additionally verified paid-new-order receipts with zero unshipped product cost, out-of-stock rejection and exact retry after replenishment, concurrent-editor rejection/reload/retry, readable actor history, variant labels, and seven focused adjustment sections at320px in English/Arabic. The private customer page showed Partially shipped/Partially paid and the exact remaining balance without internal notes/costs. No live customer order, payment, stock or notification was changed during these checks.

Meta queued contents now use billable quantities after removals/returns; fully reversed orders are not dispatched as purchases. Existing sent-event identities remain unchanged.

Release checks: 153 automated tests passed with the atomic migration bundle, plus the production static export. Existing workflow tests now use guarded managed-order actions for new orders and explicitly check legacy bypass rejection. Deployment verification is pending.

Hosted verification: atomic migration applied. A rolled-back production-database scenario passed partial receipts, split shipment/remainder release, unavailable-unit removal, replacement, physical return/restock, partial refund, delivery closure, shipment costs, duplicate retry and customer-denial checks. Test inventory, orders, cash and audit rows were rolled back; no test notifications became visible to the dispatcher.

Final chronology regression confirms that returns cannot precede their eligible shipment/delivery and a corrected delivery date cannot follow an already recorded delivered return. No additional migration was necessary because the workflow guard already enforces those rules. Final production build and all 153 tests passed.
