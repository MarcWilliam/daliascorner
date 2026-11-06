# Store backend and admin setup

Implementation branch: `codex/supabase-store-admin`. The existing GitHub Pages deployment is unchanged. Do not merge or switch the live domain until the acceptance checks below pass.

## Connected project

- Supabase project: `daliascorner` (`yevttogvgoubjxolqkpy`), Frankfurt, Free organization.
- Schema, 15 catalog variants, stock reservation functions, admin policies and a five-minute expiry cron have been applied.
- `create-order`, `notify-admin` and `product-catalog` Edge Functions have been deployed.
- All inventory starts at **zero**. Enter actual stock in the admin page before accepting orders.
- `.env.local` contains the project's public URL and publishable key. It is ignored by Git.
- `ALLOWED_ORIGINS` has been set to the apex domain, www domain and `http://localhost:3000`. Add the exact Cloudflare preview origin when available. This is a CORS allowlist, not an authentication mechanism.

## Admin account

1. In Supabase **Authentication → Users → Add user → Create new user**, enter your chosen email and password yourself. Confirm the user when creating it. There is no public signup screen.
2. Grant only that user admin membership using its UUID (not the organization account ID):

   ```sql
   insert into public.admin_users(user_id)
   values ('AUTH_USER_UUID') on conflict do nothing;
   ```

3. Open `/admin/` and sign in. The UI gate is for convenience; database RLS and mutation functions enforce admin access independently. Ordinary authenticated users cannot read orders or change stock.
4. Configure Supabase **Authentication → URL Configuration** with the site URL and exact `/admin/` redirect URLs for production and previews. Password recovery returns to `/admin/`.
5. Configure custom SMTP before relying on password resets. The default Supabase mailer only sends to project team addresses and is heavily limited. Disable public signups in Supabase if only admins need accounts.
6. To revoke an admin, remove its `admin_users` row. Every privileged database call checks this table, so an existing JWT does not retain admin authority. Revoke the user's sessions in Auth too.

## Checkout protection

Create a **free Cloudflare Turnstile** managed widget for the shop and approved preview/test hostnames. Set:

- Frontend `.env.local` and Cloudflare build environment: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- Supabase **Edge Functions → Secrets**: `TURNSTILE_SECRET_KEY`.

The backend requires a valid, single-use token, expected hostname and `checkout` action. It fails closed if configuration is missing. Do not put test bypass keys in the live project. No service-role/secret key belongs in frontend environment variables.

## Mobile push notifications

The admin app uses standard Web Push; no native app or paid notification service is required.

1. `node scripts/generate-push-config.mjs` generates `.env.push.local` with owner-only permissions and adds the public key to `.env.local`. This has already been run locally. It refuses to overwrite an existing key pair.
2. In Supabase **Edge Functions → Secrets**, configure the values from the private file:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`
   - `NOTIFY_SECRET`

   Enter secrets directly in the dashboard; do not paste them into chat or commit them. Alternatively, after authenticating the Supabase CLI, use its documented secrets-set command with `--env-file .env.push.local` and the explicit project reference. Use `supabase secrets set --help` first; CLI v3 changes hosted-operation flags.
3. In Supabase **Vault**, create `store_function_url` with `https://yevttogvgoubjxolqkpy.supabase.co/functions/v1/notify-admin` and `store_notify_secret` with the same value as `NOTIFY_SECRET`.
4. Execute `supabase/setup-notification-cron.sql` once. It schedules a check every minute but only invokes the Edge Function when there are unsent events. One call per minute is about 43,200 monthly calls at most, within the current Free allowance of 500,000 calls/month before other functions.
5. Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to the Cloudflare build environment and rebuild.
6. On an iPhone running iOS 16.4+, add `/admin/` to the Home Screen, open it from there, sign in and choose **Notifications → Enable phone notifications**. Android supports Web Push in compatible browsers. Enrollment requires a user gesture and permission.
7. The local **test notification** button checks the device permission/service-worker path. A real test order is still needed to verify the entire server-to-phone path.

Push alerts contain no customer information. In-app notifications remain available even when delivery fails. Expired device subscriptions are removed. Retry batches are leased and limited to eight attempts; duplicate delivery after a network failure is possible, with a stable notification tag to replace prior alerts. Check unsent notifications with eight attempts in Supabase if delivery fails. Notifications are not a substitute for checking the order list.

## Cloudflare Pages

Use the existing Next.js static export, not Workers SSR:

1. Connect the GitHub repository in **Workers & Pages → Create → Pages → Connect to Git**.
2. Start with branch `codex/supabase-store-admin` for a preview, leaving the current live domain untouched.
3. Framework preset: **Next.js (Static HTML Export)**. Build command: `npm ci && npm test && npm run build`. Output directory: `out`. Node version: `22.23.1` (matches `.nvmrc`).
4. Add public build variables from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `NEXT_PUBLIC_SITE_ORIGIN` (use the production domain for final production build)
5. Keep `NEXT_PUBLIC_BASE_PATH` empty. The admin service worker assumes deployment at the origin root.
6. Add the exact Pages origin to `ALLOWED_ORIGINS`, the Turnstile widget hostname list and Auth redirect URLs.
7. After acceptance, attach `daliascorner.com` to Pages, perform the DNS cutover, and disable the old GitHub Pages deployment workflow. The custom domain must be associated in Cloudflare Pages before switching DNS.

`wrangler.toml` and `public/_headers` prepare the output for Pages. Static assets stay on Cloudflare so product photos do not consume Supabase bandwidth. Pages Functions/SSR are not used.

## Order and stock behavior

- Guest checkout saves a pending order before showing its WhatsApp continuation link. The final message uses server prices, item names, quantities, subtotal and order number.
- Delivery fees and payment are still agreed in WhatsApp. The saved subtotal is for items only. No online payment is collected.
- Every request has an idempotency key retained for retry. Retrying the same request reuses the same order and reservation. Clicking **Start a new order** explicitly starts another purchase.
- Pending orders reserve stock for 24 hours; the five-minute cron releases expired reservations. Confirmed orders remain reserved until shipping or cancellation.
- `on_hand` includes reserved units. `available = on_hand - reserved`. Shipping reduces both on-hand and reserved counts. Cancellation releases only the reservation. Manual stock changes cannot take on-hand below reserved units.
- Shipped orders cannot be cancelled to avoid silently restocking goods still in transit. Returns require a deliberate stock adjustment and payment-status update.
- Price/catalog content is still maintained in `lib/products.json`; this release adds stock editing, not a product CMS. Keep database prices and storefront prices aligned when changing prices or promotions.
- Customer details remain in browser local storage for repeat orders and are stored centrally when checkout is submitted. The privacy page has been updated to describe this.
- Meta continues reporting a Lead, not a Purchase. Confirmed-sale Conversions API integration is a separate follow-up.
- On Cloudflare Pages, `/catalog.csv` redirects to the `product-catalog` Edge Function, which reads live availability and prices with a 60-second cache. Point Meta directly at that function URL if needed. Static structured data omits stock availability once Supabase is configured. Run `node scripts/generate-catalog-metadata.mjs` and redeploy the feed function when product descriptions/images change.

## Verification and release acceptance

`npm test` includes real local PostgreSQL execution using PGlite: stock reservations, rollback, duplicate checkout, cancellation, shipping, expiry, authorization and validation. `node scripts/verify-supabase.mjs` checks the live public API without printing keys or customer records.

Before domain cutover:

- Sign in as a real admin; verify a non-admin cannot access orders or stock.
- Enter actual variant quantities. Do not invent initial stock.
- Save a test order from the preview with Turnstile; verify the saved record and WhatsApp content match.
- Retry the same request and verify only one order/reservation exists.
- Confirm/cancel/ship test orders and check counts. Test the last-unit race from two clients.
- Receive a real server-triggered notification on the admin's phone with the browser closed; test denied permission and sign-out.
- Test recovery email with configured SMTP.
- Verify narrow/wide Arabic and English layouts, keyboard navigation and error states.
- Set up regular database exports: the Free plan does not include automatic backups and can pause after inactivity.

Do not call the store live until these account-dependent checks pass.

## Verified during implementation

- Connected organization verified as Free; PostgreSQL 17 project was initially empty.
- 15 local tests passed, including database transactions and role-based access checks.
- Live public REST checks passed: inventory readable; orders, items, admin memberships, stock audit and push subscriptions denied to anonymous callers.
- Live synthetic order/retry/expiry assertions passed inside a rolled-back transaction; no fixture products or orders were retained.
- Live catalog returned 15 out-of-stock variants matching initial inventory.
- The supplied Auth account was granted admin membership; no password was read or stored by the agent.
- English and Arabic login layouts checked at phone width. Signed-in screens, password recovery and server-to-phone push still need account/device acceptance.
- Security advisor warnings for the intentionally public availability RPC and admin-checked SECURITY DEFINER functions were reviewed. The platform's internal `rls_auto_enable` helper was revoked from API roles. `admin_users` deliberately has RLS and no client policies (deny-all). See [Supabase privileged function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Unused-index notices are expected on a new empty store.
