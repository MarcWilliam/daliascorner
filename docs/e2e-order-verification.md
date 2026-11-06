# Integrated order verification — 6 November 2026

Environment: Cloudflare review site `https://dalias-corner.pages.dev`, connected hosted Supabase project. The owner explicitly approved a labelled live TEST order, notification delivery, simulated payment/fulfilment/refund records and targeted cleanup. No money moved and no goods were fulfilled.

## Observed live flow

Guest checkout placed **DC-3**, one Azza at **450 EGP** plus the configured Cairo delivery fee of **100 EGP**, total **550 EGP**. Real checkout protection remained enabled; no production test key or bypass was installed. Advertising consent was off throughout, and the test produced zero Meta events.

| Step | Observed result |
| --- | --- |
| Submit website checkout | Receipt and private tracking page showed the server total, COD and pending/unpaid status |
| Reserve one unit | On hand 10, reserved 1, available 9 |
| Scheduled new-order push | Queue sent once; owner confirmed the physical phone alert |
| Mark paid in admin | Receipt ledger +550; stock unchanged; unknown cost correctly blocked profit/margin |
| Complete only the TEST item's original cost | Cost 150; estimated profit 400; margin 72.73% |
| Record a simulated shipping expense | Expense 40; tracked cash 510; estimated profit 360; margin 65.45% |
| Confirm → ship → deliver using admin controls | Stock 9, reserved 0; delivery status reached private tracking |
| Attach private order using an existing authenticated account | Account showed the order; original anonymous guest access stopped |
| Correct paid → unpaid, then mark paid after delivery | Correction reversed cash and recognized costs; repayment restored them once |
| Record a full refund | Net receipts 0; product cost remained 150; profit estimate -190 including the expense; stock was not silently returned |
| Void test expense | Expense stopped affecting totals and remained visibly voided; profit estimate -150 |
| Test low-stock threshold, then restore stock | Temporarily set count to 3, generated a low-stock event, immediately restored original count 10 |
| Repaired worker through cron | HTTP 202 acknowledged background work; queue completed; owner confirmed the second physical phone alert |

Current costs for real products were never changed. Only the test order received a historical cost entry.

## Defects found and repaired

- Readable stale storage plus failed new writes could replace an in-memory retry key, risking duplicate orders after an ambiguous response. Matching in-memory attempts now take priority.
- Slow account requests could commit stale results after sign-out/account changes. Requests now cancel and verify their current identity before data, storage or navigation updates.
- Paid pending receipts older than 24 hours could be falsely rejected on retry. The order RPC now returns payment status and the client respects paid reservations.
- Revoked guest links displayed misleading working-link and first-order controls. They now show a dedicated unavailable/sign-in state.
- Product delivery copy still referred to confirming fees in chat. Both languages now describe website checkout and tracking.
- Notification dispatch marked stale-only device failures as sent and allowed Meta requests to delay mobile pushes. Provider acceptance is now required; unusable devices preserve retry eligibility; independent background jobs acknowledge promptly.
- An unsent Meta Purchase could outlive a payment correction/refund. Dispatch now checks current payment state, and a later genuine repayment rearms only an unsent event using the same deduplication ID.

Background processing follows [Supabase's background-task API](https://supabase.com/docs/guides/functions/background-tasks). A worker HTTP 202 means accepted for processing; it does not prove delivery. This run verified the queue and owner-confirmed phone receipt as well.

## Coverage and cleanup

Automated real-Postgres tests cover the combined website wrapper, mixed finite/unlimited quantities, fee/cost snapshots, retries, notification leases, payment/refund totals, cancellation and expiry. Provider fakes cover stale devices, transient failures, independent worker execution and payment reversals before Meta dispatch. Local database tests do not establish external provider delivery; the live phone checks above do.

Final checks: **57/57 automated tests passed**, TypeScript/production static export passed using Node 22.23.1, and public API checks continued to deny privileged order, stock, finance and notification access.

Only explicitly identified TEST records were removed after verification: order/item/cost/payment entries, test expense, related stock movements and two test notifications. Original inventory, historical movement and original notification were preserved. The admin device remains enrolled. Final hosted checks returned **0 orders, 0 expenses, 0 payment events, 0 order-cost snapshots**, and Azza **10 on hand / 0 reserved**.

Sequence values can have gaps after tests and rolled-back transactions; order numbering was not rewound. No custom-domain cutover was performed. This run attached through an existing authenticated account; it did not repeat Google's consent flow or publish Facebook login.
