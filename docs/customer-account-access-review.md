# Customer account and access review

Scope: feature branch and Cloudflare review deployment. Customer registration remains social sign-in: the first Google sign-in creates a customer account; later sign-ins return to that account. Facebook remains hidden pending the owner's previously deferred Meta verification/review. This change does not add email/password customer signup or an SMTP dependency.

## Application roles

| Role | Access |
| --- | --- |
| Guest | Browse, guest checkout, private tracking when holding its unguessable link |
| Customer | Own profile and attached orders; guest checkout remains available |
| Admin | Explicit membership in `admin_users`; orders, stock, finances, settings and notifications |

Both customer and admin sessions use Supabase's `authenticated` database role. That role does not mean store administrator. `is_admin()` checks the authenticated user ID against the protected membership table. Editable profile/provider metadata never grants admin rights. Signup and profile completion do not insert membership rows. Membership removal is enforced by table policies and mutation functions, even with an existing access token.

Read-only hosted audit found two confirmed accounts: one original email-provider admin and one non-admin Google account. The sole admin membership still matches the originally authorized owner. No memberships were added or removed by this review.

## Fixes

- Added optional first-login profile completion, skip/resume, and later editing. Name is required to save; phone, address and delivery area are optional until checkout. Email is read-only and managed by the sign-in provider.
- Profiles are lazy, owner-only rows. Customers can only save their own fields through identity-bound RPCs; no editable role or user ID argument is accepted. Store admins do not receive global browser access to customer profiles; order contact snapshots remain available for fulfilment.
- OAuth cancellation/failure now shows safe local feedback and clears stale checkout-return intent. Authentication initialization cannot overwrite a newer auth event, and language changes no longer restart session initialization.
- Admin links and views use verified server membership. Customers receive a clear denied screen. Failed role checks close the admin view and provide retry. Admin reads are cancelled and identity-checked to prevent stale responses crossing account changes; membership is rechecked on refresh/focus.
- Checkout defaults use the current user's completed profile. Explicit edits, including cleared fields and alternate gift recipients, are preserved. Browser delivery drafts are scoped to the active account, cleared on sign-out, and no longer reuse the old unowned global cache. A recent, explicit guest-checkout OAuth handoff can preserve guest-entered details once; account switches never borrow another account's draft.
- Tightened delivery/payment configuration ACLs. Hosted defaults had granted `TRUNCATE`, `TRIGGER` and `REFERENCES` to client roles. Normal unauthorized writes were already blocked by RLS, but whole-table operations are not covered by row security. Only intended public reads and admin-policy writes remain; backend service access is preserved. See [PostgreSQL row-security boundaries](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
- Removed client read/advance/reset privileges on all five internal order/audit sequences. Future `postgres` sequence defaults are also narrowed. The migration role cannot alter separate `supabase_admin` defaults; future platform-owned sequences need explicit client revokes in their migration. No currently deployed sequence retains those client grants.
- Checkout requests, verification callbacks and saved receipts are identity-scoped. Late responses and receipts cannot cross sign-out/account changes. Guest-to-customer and legacy retries retain identifiers so the protection does not duplicate an ambiguously saved order.

## Verification

Real PostgreSQL tests simulate broad hosted defaults, then verify guest/customer/admin permissions, metadata spoofing, fresh signup, membership revocation, cross-customer order/profile isolation, own-only profile save/skip, and preserved legitimate admin configuration changes. Additional tests cover role-result freshness, OAuth error cleanup, profile validation, and account-scoped delivery defaults.

Local browser checks used synthetic admin/customer personas: regular login at `/admin/` showed no admin controls; profile completion did not grant access; onboarding skip survived reload; save failure preserved entries; retry and later editing worked; checkout used saved name/address/area while keeping a typed recipient; logout emptied delivery fields; cancellation removed untrusted provider text; role-check failure hid controls and retry restored legitimate admin access. English/Arabic, keyboard focus and 320/390/1280px layouts were checked. No new real Google consent or live customer profile write was performed for this test.

Final verification: **95 automated tests passed**, along with the Node 22.23.1 production export. Both hosted access migrations are applied. A rolled-back hosted role test confirmed own-only profile save/skip/read, inability to self-grant admin or access finance/configuration, preserved owner configuration access, and removal of unsafe configuration privileges. Live sequence inspection confirmed all client sequence rights removed and backend use retained. Public API smoke checks deny anonymous profile reads/writes. A final local positive checkout produced a receipt and confirmed it disappeared on logout together with delivery details. No QA profiles or extra admin memberships remain; the original owner is still the sole admin.
