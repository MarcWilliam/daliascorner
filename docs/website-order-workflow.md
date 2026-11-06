# Website orders and social accounts

Feature branch only. The custom domain has not been switched.

## Customer journey

1. Add products to the cart. Sign in via an enabled Google/Facebook provider before checkout, or continue as a guest.
2. Enter delivery details, select an active admin-configured zone, choose cash on delivery or manual transfer, and pass Turnstile.
3. Place the order on the website. Backend prices and delivery fees determine totals. Transfer instructions and delivery fees are snapshotted with the order. No social message is required.
4. Open the private order page. The guest token uses the URL fragment (not query parameters) and is removed from the address bar after capture. Private pages never load Meta Pixel.
5. A guest can use social sign-in afterward to attach the order to the account. Attachment requires possession of the original private token, not merely knowing an order number or email. Once attached, anonymous token access stops.
6. Account history shows up to 100 recent orders. Keep the private link for guest orders; email receipts are not implemented in this iteration.

## Admin setup

Under Stock, configure Delivery & payment settings. Add bilingual delivery zones and fees; enable manual transfer only with complete public transfer instructions. No delivery zones or bank details are invented. All quantities still need real values.

Order cards show payment method, delivery zone, delivery fee and total. Only admins can mark payments paid/refunded. Existing reservation, cancellation, shipping and expiry rules remain. Pending orders expire after 24 hours, so confirm accepted orders promptly. Transfer instructions stop displaying after cancellation or expiry.

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

Existing browser PageView/ViewContent/AddToCart/InitiateCheckout events remain consent-gated. Website order submission queues a server Lead; an admin marking a non-cancelled order paid queues Purchase. Neither a checkout click nor selecting manual transfer means paid. Stable per-order event IDs and unique queue keys prevent duplicate conversions on retries. Delivery fees are included in conversion value.

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
