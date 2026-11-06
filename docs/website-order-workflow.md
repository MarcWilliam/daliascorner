# Website orders and social accounts

Feature branch only. The custom domain has not been switched.

Latest integrated evidence: [end-to-end order verification](e2e-order-verification.md), including live checkout, stock/finance reconciliation, account attachment, owner-confirmed phone alerts and cleanup.

Admins can also [record orders received in chat](manual-chat-orders.md), using catalog prices and delivery fees with the same stock and finance lifecycle.

Customer registration/profile steps and the verified guest/customer/admin boundaries are documented in [the account and access review](customer-account-access-review.md).

## Customer journey

1. Add products to the cart. Sign in via an enabled Google/Facebook provider before checkout, or continue as a guest.
2. Enter delivery details, select an active admin-configured zone, choose cash on delivery or configured InstaPay, and place the order.
3. Place the order on the website. Backend prices and delivery fees determine totals. Payment details and delivery fees are snapshotted with the order. No social message is required.
4. Open the private order page. The guest token uses the URL fragment (not query parameters) and is removed from the address bar after capture. Private pages never load Meta Pixel.
5. A guest can use social sign-in afterward to attach the order to the account. Attachment requires possession of an original or unexpired private share token, not merely knowing an order number or email. Once attached, anonymous token access stops.
6. Account history shows up to 100 recent orders. Keep the private link for guest orders; email receipts are not implemented in this iteration.

## Admin setup

Under Settings, configure Delivery & payment. **Add zone** opens the bilingual name/fee form. For InstaPay, enter the official payment link copied from the InstaPay app (`https://ipn.eg/...`) and/or receiving Egyptian mobile number or `name@instapay` address, review the recipient, enable InstaPay and save. Until a recipient is configured, new InstaPay orders are unavailable; cash on delivery can remain enabled. The owner will enter the recipient after deployment. No delivery zones or payment details are invented. Enter actual stock under Stock, or explicitly enable unlimited stock per product.

New website/chat InstaPay orders retain a snapshot of their recipient. The private unpaid order page lets the customer copy the recipient or open the saved payment link. Later Settings changes affect only new orders. Existing/historical orders are not backfilled with today's recipient. Opening InstaPay does not confirm payment: an admin verifies receipt before marking the order paid.

Successful unpaid InstaPay receipts and private order pages offer **Send payment screenshot on WhatsApp**. The link uses the shop number in `lib/config.ts` and a fixed localized message containing only the public `DC-…` order reference. The customer attaches and sends the screenshot in WhatsApp; the site does not upload or send a file automatically. The admin custom-instructions field is removed. Previously stored instructions remain in database history but are no longer rendered or edited by this interface. Cash orders and checkout before an order exists do not offer the payment-proof action.

The successful receipt has one main action to view the private order and create an account. Closing it clears the completed basket so ordinary shopping can resume. Editing the basket while the receipt is open starts a fresh checkout while preserving the newly selected items. The separate recovery action for an expired order remains available.

Order cards show payment method, delivery zone, delivery fee and total. Only admins can mark payments paid/refunded. Pending orders with no net receipts expire after their reservation deadline. Positive deposits protect pending reservations. Managed partial shipments release all outstanding holds, and later shipments check availability again. Transfer instructions stop displaying after cancellation or expiry.

## Social provider activation

In Supabase Authentication → Sign In / Providers, configure Google and Facebook using the providers' own app credentials. Their OAuth callback is:

`https://yevttogvgoubjxolqkpy.supabase.co/auth/v1/callback`

Allow the following Supabase frontend redirects:

- `https://dalias-corner.pages.dev/account/`
- `https://daliascorner.com/account/`
- `http://localhost:3000/account/`

For Google, configure a Web OAuth client and production consent screen. For Facebook, configure Facebook Login, the callback, required email permission, privacy-policy URL and account-deletion instructions. A development-mode app only permits app roles/test users; verify Live availability before promising public login.

After the providers work, enable their public build flags in Wrangler:

- `NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED = "true"`
- `NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED = "true"`

They default to hidden until configured. Admin email/password login remains available. Social login avoids sending signup/password-reset mail for customer accounts; order emails still require a separate sender.

## Meta conversions

Existing browser PageView/ViewContent/AddToCart/InitiateCheckout events remain consent-gated. Website order submission queues a server Lead; an admin marking a non-cancelled order paid queues Purchase. Neither a checkout click nor selecting InstaPay means paid. Stable per-order event IDs and unique queue keys prevent duplicate conversions on retries. Delivery fees are included in conversion value.

Save `META_ACCESS_TOKEN`, `META_PIXEL_ID` and `META_GRAPH_VERSION` in Supabase Edge Function Secrets. Use the existing Pixel `1574733761109578` after verifying ownership in Events Manager. The verified dataset and Graph v27.0 are the defaults in `_shared/meta-config.ts`; environment variables can override them. The version was checked against Meta’s official Dataset Quality reference. Add `META_TEST_EVENT_CODE` for Events Manager tests, then remove it before genuine reporting.

The notification worker dispatches Meta events as well as push. Queues remain unsent without configuration; this is not proof of a connected Meta integration. It retries leased batches, stops after eight attempts, and does not send events older than six days. Review queued failures operationally. Refunds after reporting are not automatically retracted from Meta.

Customer order pages offer revocation of future order ad reporting. Already-delivered events cannot be withdrawn by this mechanism. Phone numbers are hashed server-side; browser identifiers and user agent are sent only with consent. No guest link/token is sent to Meta.

## Verification status

Local production build and 17 tests passed before external OAuth/Meta setup. Database tests cover fee snapshots, private links, account attachment, role restrictions, stock lifecycle and exactly-once queue insertion. End-to-end OAuth with real providers, Meta Test Events acceptance, a real configured delivery zone and an actual website test order remain release checks. Do not mark those complete based only on a successful build.

## Dataset Quality and campaign monitoring

The admin Meta & ads view calls an admin-only Edge Function. It shows Meta-reported match quality, event coverage, upload frequency, event-associated spend and ad-set use where available. Missing metrics are not represented as zero. These are dataset-wide, cached five minutes, and may include existing integrations; event-associated spend must not be summed as an account spend total. Campaign creation and budget changes remain in Ads Manager.

Verified: the saved Dataset Quality-enabled token returned five event types for both core quality and campaign queries. A synthetic Lead sent with Meta Test Events code was accepted by Graph API and displayed as Processed / Server in Events Manager. It created no website order and reported no real purchase. The access token remains exclusively in Supabase secrets.

Google setup: the Web OAuth client is configured in the dedicated DaliasCorner Google project, with the exact Supabase callback. Google audience is In production; Supabase Google provider and exact /account/ frontend redirects are enabled. Only basic login identity is requested. Full customer sign-in acceptance remains to be observed. Facebook is still hidden until its provider is configured.

Facebook setup: app `1642675637558570` (Dalias Corner) was created under the shop business portfolio. Public profile and email are selected for login testing; the strict HTTPS Supabase callback, website platform, privacy/deletion-instructions URLs, Shopping category and existing brand icon are configured. Meta explicitly requires business verification and App Review before public login. Do not enable the public Facebook button before approval and successful testing. App secret connection is a separate step from the Conversions API token.


## Facebook review handoff

Meta app: `1642675637558570`, business portfolio: `1295256528744394`. The provider can be enabled in Supabase for app-role testing while the normal customer Facebook button remains hidden. Meta's Publish screen explicitly lists the portfolio as Unverified and disables Publish.

Reviewer/tester entry point: `https://dalias-corner.pages.dev/review/facebook/`. This uses the same Supabase Facebook OAuth flow, requests only basic profile/email, and returns to `/account/`. Meta still enforces app-role and review eligibility; the page does not bypass those restrictions and never grants store-admin access.

Suggested review steps: open the review URL, select Continue with Facebook, approve the basic profile/email prompt with an eligible Meta test/reviewer account, verify return to My account & orders, and sign out. For an order-attachment demonstration, first configure real delivery rules and stock, submit a test guest order, and then use Facebook sign-in from the same browser. Cancel the test order afterward. Record actual results; do not claim completion before performing the test.

The owner must complete business/identity verification using genuine details and documents, and review any data-handling declarations before submitting App Review. Google login and guest orders can operate while Facebook waits for approval. Do not switch on `NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED` until Meta approves public access and a sign-in has been verified.

Workflow hardening: in-memory checkout retries now retain both idempotency and guest-access identifiers if browser storage is blocked. Private account/review pages suspend Pixel activity without deleting existing consented attribution cookies; explicit consent withdrawal still clears them. Regression suite: 20 tests passed, plus production build.


Current handoff: Google is enabled for customers and a real Google identity was observed in Supabase after the owner tested it. Facebook provider configuration and OAuth redirect are verified; public publication is pending at the owner's request. Reviewer instructions have been auto-saved as a draft in Meta; nothing was submitted. The owner must complete verification and review operational declarations before public Facebook activation.

The legacy `create-order` Edge Function returns HTTP 410. All website checkout uses `place-order`, which requires an active delivery zone and enabled payment method. This closes the old preview path that lacked delivery-fee selection. Public anonymous callers cannot invoke the privileged order-creation SQL functions directly.

Retry ownership hardening: signing in does not change the checkout content fingerprint. A guest retry after sign-in reuses the saved order; once attached to an account, anonymous or other-account retries are rejected. Applied before any website orders existed. Regression suite now has 21 passing tests.

## Checkout abuse protection

Checkout no longer loads or requires Cloudflare Turnstile. The Edge Function applies shared Postgres request counters: global 100/10 minutes, connection 20/10 minutes, normalized phone 5/hour. Retries count as attempts; 429 responses include Retry-After. Database failure blocks submission with 503. Phone/IP keys use HMAC-SHA256 with the backend secret, and only hashes/counters/expiry are stored in a private RLS table. Stale rows are purged on later limiter calls. Connection headers are gateway signals; phone and global limits also apply independently. A hidden website honeypot rejects filled submissions. Existing origin checks, payload validation, server pricing, stock reservations and idempotency remain enforced. Payment remains manually verified.

Managed order tracking shows partial payment/fulfilment, removed/returned units and balances due/refund due. Internal notes, costs, shipment-return allocations and admin audit details are excluded from customer projections.
