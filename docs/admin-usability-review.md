# Admin and checkout usability review

Scope: feature branch `codex/supabase-store-admin`, using the existing catalog, branding, English/Arabic and static Cloudflare Pages frontend.

## Compact admin implementation

- Orders use a compact responsive list with a details drawer. Payment autosave, fulfilment actions and refund guidance remain available in that drawer.
- Chat orders use a full-height drawer with a persistent total/save footer. New and historical order rules are unchanged; closing retains the draft until reload/sign-out.
- Expense entry and void confirmation use dialogs. Cancellation retains the expense draft and retry identity. Void confirmation identifies the amount/date/category/note before changing the tracked expense.
- Delivery zones use name/fee/status rows with Add/Edit dialogs. Cancelled and failed entries remain available; zero fees are supported and saving a zone preserves unrelated payment-setting drafts.
- Stock has a compact toolbar, a Restock dialog, always-visible unit-cost fields and a separate history drawer. History filters explicitly cover loaded recent activity, rather than claiming a full historical search.
- Financial report uses Cairo-based date presets, smaller metric cards and margin beside profit. Calculation explanations remain available in its disclosure. Summary formulas and immutable cost rules are unchanged.
- Notifications show compact device status and setup help on demand. Order alerts open the matching details drawer, including orders outside the loaded page; product alerts filter Stock to that product. Existing enable/test/read controls are preserved.
- Meta leads with connection health and actionable issues; technical queue counters are under Delivery details. Dataset coverage, cached readings, unavailable values and overlapping ad spend retain their distinct meanings.
- Shared admin headers remove duplicate branding/taglines. Mobile uses a native section menu; desktop retains the sidebar. Quieter shadows, button edges and corners are scoped to admin; storefront styling and 48px fields are unchanged.
- Shared native dialogs provide a scrollable body, focus wrapping/restoration, Escape/close actions and busy dismissal guards. Drawers fill phone viewports; their footer stays visible while the form scrolls.

Verification: 113 automated checks passed. Synthetic browser checks covered payment autosave and shipping, chat-order save/receipt navigation and retained drafts, expense save/void and visible failed-save recovery, zero-fee zone saves and cancelled drafts, restock drafts across views, history filtering, notification order/product navigation, and Cairo date presets. All seven Arabic sections fit a 320px viewport; desktop checks used 1280px. Narrow RTL table containment and dialog viewport alignment/focus issues found in QA were repaired. No real orders, stock, expenses or notification preferences were changed during this UI work. No schema migration is required.

## Changes

- Customer login opens a shared dialog from the header and checkout. Closing it returns to the cart when opened there. OAuth still returns through `/account/` so a private guest order can be attached before resuming shopping.
- Checkout explains missing customer details, delivery area and security verification, rather than silently disabling submission for these conditions. Configuration failures and checkout pauses have distinct messages and retries.
- The account page has a signed-in account card, order history and an actionable empty state.
- Stock offers a compact Table view and a Cards view, with existing product photos/categories, search and filters. The selected view is remembered; unsaved quantity and cost drafts survive view changes. Mobile defaults to cards. This does not add a product-content editor.
- Add/remove/set stock replaces the reason field. Audit entries retain automatically generated descriptions. Counts cannot fall below reservations.
- Unlimited stock is a per-product mode. Every order item remembers whether it reserved finite stock; changing a product's mode cannot erase or create reservations for existing orders.
- Storefront quantity hints appear only for 1–3 available units, plus sold-out status. Higher quantities and unlimited stock do not display counts.
- Delivery and payment configuration has its own Settings page, with load/retry states, preserved failed entries and visible checkout-paused status. **Add zone** opens a focused inline form with a Cancel action. Saving a zone preserves unsaved payment-setting drafts.
- Orders have search, item photos, automatically saved payment selections, reservation deadlines and payment/refund guidance. Payment changes show saving/saved feedback and reconcile the current server status after errors; an unverified status stays locked until reloaded. Paid pending orders retain stock after the unpaid reservation deadline.
- Product unit-cost inputs stay visible on stock cards, with the existing explicit cost-save action and new-order-only costing guidance.
- Expenses has its own register with search, dates, categories, active/voided filters, exact filtered totals and pagination. Its entry draft survives switching to Financial report. Financial report contains cash movement, paid-order profit estimates, missing costs and payment history. Product costs are admin-only and snapshotted for new orders.
- A desktop sidebar and horizontally scrolling mobile navigation identify the active page. Each page has one heading and one accessible icon-only Refresh control.
- Meta monitoring separates this website's conversion queue from dataset-wide event quality, adds connection status and management links, and distinguishes missing data from zero. Readings show their Cairo refresh time and five-minute cache. Event-associated ad spend remains separate from the store's recorded expenses.
- InstaPay replaces the customer-visible Manual transfer label. Settings accepts an official HTTPS `ipn.eg` link and/or Egyptian receiving mobile number or `name@instapay` address. New transfer orders require a configured recipient, snapshot that recipient and retain it on retries/settings changes. Historical and older orders are not assigned today's recipient. Customer private order pages show saved details and an optional link; admins still verify payment themselves.
- The successful receipt omits **Start a new order**. Closing it finishes that basket; a deliberate basket edit preserves the new selection and starts a fresh checkout. Unpaid InstaPay receipts/private order pages instead offer a standard WhatsApp payment-proof link with the public order number. Customers attach the screenshot in WhatsApp. Admin shows the configured shop WhatsApp number in place of the custom instructions field; legacy instruction text is no longer displayed.
- Checkout and all admin fields share `.store-field`: single-line inputs, dates and dropdowns are 48px high with 12px corners, matching typography, borders, focus and disabled states. Dropdown arrows mirror in Arabic; textareas keep their multiline height. Native selection and picker behavior is retained.

## Boundaries

Actual restocks, costs, delivery rules, transfer instructions and expenses must be entered by the owner. No opening stock or financial balances are invented. Google customer login remains enabled. Public Facebook login remains pending Meta verification and review at the owner's request.

Finance is a manual management tracker: payment status records money received/refunded; selecting a checkout payment method does not collect money. It does not automatically import bank transfers, supplier purchases or Meta ad bills.

The Cloudflare feature deployment is separate from the existing custom-domain site. No custom-domain cutover is part of this review.

## Verification

- 113 automated checks pass, including real PostgreSQL execution through PGlite for stock modes, reservations, expiry, payment/refund history, filtered expense pagination/totals, InstaPay eligibility and immutable recipient snapshots, localized payment-proof links, cost snapshots and customer/admin access boundaries.
- Production static export passes using Node 22.23.1.
- Local browser checks use synthetic data: actual checkout POST failure and success receipt; sign-in dialog cancellation and cart restoration; mobile stock changes; expense entry and missing-cost completion; payment save and order confirmation; notification read status; failed delivery-zone save preserving entries followed by successful retry.
- English/Arabic and narrow/desktop layouts were checked at 320, 390 and 1280 pixels. Finance date controls were repaired after the narrow-screen check. Product images loaded and affected screens did not overflow horizontally.
- Supabase migrations are applied. Public API checks deny access to orders, finance and costs. Hosted unlimited stock, paid-order confirmation after the reservation deadline, costing and refund-ledger checks passed in a rolled-back transaction.
- No synthetic orders, stock, costs or expenses were retained in Supabase. Local UI fixtures are not committed. A genuine checkout with live Turnstile was not submitted during this review.
- Payment autosave was checked against local fixtures for success, failed mutation with authoritative status recovery, and unavailable status-read locking/reload. Stock showed all 15 cost inputs with no disclosure controls, including narrow Arabic layout. No live payment was changed for these UI checks.
- The six-point admin update was checked with local synthetic data: table/card draft preservation and stock/cost saves; expense add failure/retry, report-switch draft preservation and soft-void history; zero-fee zone add failure/retry; unsaved payment settings preserved during zone saves; new chat-order InstaPay snapshot shown privately and unchanged after settings changes. No external payment link was followed. Updated Expenses, Financial report, Settings and Meta layouts fit a 320px Arabic viewport without page overflow.
- The expense register and InstaPay migrations are applied in Supabase. Hosted rollback checks passed for exact expense counts/totals, authenticated customer denial, missing-recipient rejection, website/chat recipient snapshots, retries after settings changes, stock/finance/refund integration and historical-order isolation. Follow-up checks found no retained test product, zone or orders. The real InstaPay recipient remains unconfigured for the owner to enter. Public API smoke checks passed, including denied anonymous expense-register access. Advisor review showed the expected authenticated definer warning for the new guarded expense RPC; its nonadmin denial was tested.
- Local synthetic browser checks verified the receipt action removal, completed-basket clearing on close, fresh checkout after a quantity edit, no proof action for COD/before order placement, and the correct English/Arabic order number in WhatsApp links on both success receipt and private guest page. The private page fit a 320px Arabic viewport without overflow. No WhatsApp link was opened and no message/file was sent.
