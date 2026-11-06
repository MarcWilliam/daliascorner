# Admin and checkout usability review

Scope: feature branch `codex/supabase-store-admin`, using the existing catalog, branding, English/Arabic and static Cloudflare Pages frontend.

## Changes

- Customer login opens a shared dialog from the header and checkout. Closing it returns to the cart when opened there. OAuth still returns through `/account/` so a private guest order can be attached before resuming shopping.
- Checkout explains missing customer details, delivery area and security verification, rather than silently disabling submission for these conditions. Configuration failures and checkout pauses have distinct messages and retries.
- The account page has a signed-in account card, order history and an actionable empty state.
- Stock cards show existing product photos and categories, with search, category and stock-status filters. This does not add a product-content editor.
- Add/remove/set stock replaces the reason field. Audit entries retain automatically generated descriptions. Counts cannot fall below reservations.
- Unlimited stock is a per-product mode. Every order item remembers whether it reserved finite stock; changing a product's mode cannot erase or create reservations for existing orders.
- Storefront quantity hints appear only for 1–3 available units, plus sold-out status. Higher quantities and unlimited stock do not display counts.
- Delivery and payment configuration has its own Settings tab, with load/retry states, preserved failed entries and visible checkout-paused status.
- Orders have search, item photos, automatically saved payment selections, reservation deadlines and payment/refund guidance. Payment changes show saving/saved feedback and reconcile the current server status after errors; an unverified status stays locked until reloaded. Paid pending orders retain stock after the unpaid reservation deadline.
- Product unit-cost inputs stay visible on stock cards, with the existing explicit cost-save action and new-order-only costing guidance.
- Finance has its own tab for expenses, cash movement and paid-order profit estimates. Product costs are admin-only and snapshotted for new orders. See the finance workflow documentation for calculation rules.
- Meta monitoring links to the relevant management tools, labels score scales and coverage goals, and distinguishes missing data from zero. Event-associated ad spend remains separate from the store's recorded expenses.
- Checkout and all admin fields share `.store-field`: single-line inputs, dates and dropdowns are 48px high with 12px corners, matching typography, borders, focus and disabled states. Dropdown arrows mirror in Arabic; textareas keep their multiline height. Native selection and picker behavior is retained.

## Boundaries

Actual restocks, costs, delivery rules, transfer instructions and expenses must be entered by the owner. No opening stock or financial balances are invented. Google customer login remains enabled. Public Facebook login remains pending Meta verification and review at the owner's request.

Finance is a manual management tracker: payment status records money received/refunded; selecting a checkout payment method does not collect money. It does not automatically import bank transfers, supplier purchases or Meta ad bills.

The Cloudflare feature deployment is separate from the existing custom-domain site. No custom-domain cutover is part of this review.

## Verification

- 95 automated checks pass, including real PostgreSQL execution through PGlite for stock modes, reservations, expiry, payment/refund history, expense retries, cost snapshots and customer/admin access boundaries.
- Production static export passes using Node 22.23.1.
- Local browser checks use synthetic data: actual checkout POST failure and success receipt; sign-in dialog cancellation and cart restoration; mobile stock changes; expense entry and missing-cost completion; payment save and order confirmation; notification read status; failed delivery-zone save preserving entries followed by successful retry.
- English/Arabic and narrow/desktop layouts were checked at 320, 390 and 1280 pixels. Finance date controls were repaired after the narrow-screen check. Product images loaded and affected screens did not overflow horizontally.
- Supabase migrations are applied. Public API checks deny access to orders, finance and costs. Hosted unlimited stock, paid-order confirmation after the reservation deadline, costing and refund-ledger checks passed in a rolled-back transaction.
- No synthetic orders, stock, costs or expenses were retained in Supabase. Local UI fixtures are not committed. A genuine checkout with live Turnstile was not submitted during this review.
- Payment autosave was checked against local fixtures for success, failed mutation with authoritative status recovery, and unavailable status-read locking/reload. Stock showed all 15 cost inputs with no disclosure controls, including narrow Arabic layout. No live payment was changed for these UI checks.
