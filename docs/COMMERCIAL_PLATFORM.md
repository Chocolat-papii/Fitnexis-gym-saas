# Commercial platform implementation

Fitnexis uses a dashboard-managed SaaS subscription plus a default **2% commission on eligible online member payments**. The gym pays Paystack fees by default. Cash/EFT records carry no platform commission. No paid plan names or prices are seeded in code.

## Where to use it

| Area | Location |
| --- | --- |
| Publish SaaS plans, prices, features and limits | `/platform/billing` |
| Commission policy, gym overrides, account activation/suspension | `/platform/billing` |
| Platform administrator roles | `/platform/administrators` |
| Audit and payment integration events | `/platform/audit` |
| Public gym registration | `/join` |
| Owner: staff, business, branches, bank verification, subscription, ownership and support | `/admin/settings` |
| Gym collection, fee and settlement reports | `/admin/financials` |
| Assigned member/trainer workspace | `/admin/training` |
| Member purchase, invoices and payment updates | `/member/billing` |

Member profiles, core membership administration, attendance, and the gym workspace remain base capabilities. Published plans control additional financial reports, online payments, staff, branches and class capabilities. Public pricing reads published plans from the database. Create a new plan to revise a price; existing invoice amounts are immutable snapshots. Plan publication can be turned off without changing existing subscribers' invoices.

## Deployment prerequisites

1. Back up the application database and encryption secrets. Apply migrations in staging first with `npm.cmd run migrate`. This implementation adds `202611110001_commercial_platform.js`, `202611110002_branch_training_scopes.js`, and `202611110003_membership_checkout.js`. Production migrations are **not** run automatically.
2. Set `SECURITY_ENCRYPTION_KEY` to a privately generated, base64-encoded **32-byte** random key. Keep it in a secret manager separately from `JWT_SECRET`. Losing it prevents recovery of historical authenticator and saved debit authorization secrets. Do not replace it during routine redeployments.
3. Use `PAYSTACK_MODE=test` and `PAYSTACK_TEST_SECRET_KEY=sk_test_...` in staging. Existing `PAYSTACK_SECRET_KEY` is a compatibility fallback only when its test/live prefix matches the selected mode. Secret keys never enter rendered templates or browser code.
4. Configure `https://APP-HOST/api/billing/paystack/webhook` in Paystack. Keep `PAYSTACK_CALLBACK_URL` on the member's gym host; optionally configure `PAYSTACK_SAAS_CALLBACK_URL` on the owner's gym host. Without a SaaS callback URL, the owner's **Check payment status** control and signed webhooks complete reconciliation. Public callback/webhook delivery must be tested on the actual deployment.
5. Live payments require `PAYSTACK_MODE=live`, `PAYSTACK_LIVE_SECRET_KEY`, and `PAYSTACK_LIVE_ENABLED=true`. Live subaccount onboarding additionally requires `PAYSTACK_ZA_SPLITS_APPROVED=true` after Paystack confirms the business's South African split/settlement eligibility. Test accounts cannot silently become live accounts.
6. Automatic SaaS debits remain off unless `PAYSTACK_RECURRING_ENABLED=true`. Enable only after confirming provider eligibility, obtaining the displayed owner consent, validating the recurring-payment terms, and completing real provider tests. A reusable authorization is encrypted, never a card PAN or CVV. Automatic renewal cannot exceed the amount the owner authorized. Split recurring **member** debits are not enabled; recurring membership invoices and hosted checkout remain available.
7. Run `ENABLE_BILLING_JOBS=true` on one dedicated worker. SaaS renewals, upcoming-renewal notices, member invoices and due-invoice notices run every 30 minutes. Database locks and uniqueness constraints protect monetary operations against duplicate workers, but one worker is recommended.
8. Production requires HTTPS. The app trusts **one reverse proxy**; deploy behind that trusted proxy and prevent direct access that could spoof forwarding headers. Set the proxy appropriately if the topology differs.

Run `node scripts/create-platform-admin.js` with the existing `PLATFORM_ADMIN_*` environment variables to bootstrap an administrator. On a fresh installation the first account is a super administrator; later CLI-created accounts are delegated administrators. All sign-ins use email verification codes; see [email sign-in setup](AUTHENTICATION.md).

## Identity migration and permissions

- Platform identities remain in `platform_admins`; gym identities remain in tenant-scoped `users`. Each request reloads permissions and checks a revocable database session. Editing JWT role claims cannot grant access.
- Existing sessions must sign in again. Old platform sessions lack MFA verification; old gym JWTs lack the scoped, revocable session identity.
- Where a gym has exactly one existing `admin`, migration designates that administrator as owner. Ambiguous gyms are **not** assigned an inferred owner. A recently reauthenticated platform super administrator can designate the verified original owner through `POST /platform/gyms/:gymId/owner` with `user_id`, `reason` and the platform CSRF token. This endpoint refuses to replace an existing owner; use verified ownership transfer instead.
- Password sign-ins require a six-digit email code. Codes expire after five minutes, allow five attempts, and can only be used once. Resends have an account-wide one-minute cooldown.
- Role, staff, banking, commission, ownership, and other high-risk changes require password confirmation plus a fresh email code. Confirmation lasts five minutes.
- Fixed role permissions live in `src/security/roles.js`. Gym admins cannot change platform commission, staff roles, ownership, or payout accounts. Receptionists have front-desk/check-in access; trainers see only their assigned training members and sessions. Training goals require member consent.
- Branch-specific session writes check authorized branch assignments. Branch/user foreign keys include `gym_id`; unassigned core workspace sessions remain gym-wide.
- Owner-authorized support grants name a platform administrator, expire within 60 minutes and can be revoked immediately. Support views are read-only and audited. No impersonated owner JWT is issued.
- Ownership transfer requires the current owner to initiate, an email-verified staff recipient to accept, and both to reauthenticate. Acceptance invalidates both parties' earlier gym sessions.

## Payment and subscription rules

Bank verification uses Paystack's South African account validation API. Full bank account and identification numbers are sent transiently to Paystack, never stored in Fitnexis. Only the bank code and masked account ending are retained. The linked subaccount must also be active, verified, ZAR-denominated and in the correct environment before checkout is enabled.

Onboarding is reserved before the remote request. An uncertain provider timeout blocks another creation attempt. Platform billing offers a recovery action: the fetched provider account must match both the original gym ID and the unique onboarding operation metadata. Pasting an arbitrary subaccount into the old billing form is disabled.

Each member checkout snapshots its commission rate, integer-cent commission, fee bearer, subaccount and environment. Paystack receives an explicit transaction charge; subsequent policy changes do not alter pending checkouts. For R500 at 2%, the snapshot is R10 commission and R490 gross gym allocation, before gateway fees. Reported gateway fees, verified refunds and expected settlements are separate values. An unknown fee is not represented as a confirmed zero.

New member purchases create an `awaiting_payment` membership and a single invoice. Full confirmed cash/EFT or server-verified online settlement activates it. Existing admin-assigned memberships retain their administration workflow. Repeated purchase requests reuse the invoice. Existing renewal invoices remain payable through the member portal. Custom membership intervals support 1–3660 days, alongside monthly, quarterly, yearly, weekly and once-off plans.

SaaS payments go to the main platform account without a gym split. Invoices snapshot prices and periods. Upgrades/downgrades on an active subscription are scheduled for renewal; there is no automatic proration. A cancellation ends access at period end and disables future automatic debits. Unpaid renewals become overdue, then expired after the configurable grace period. Paid features are restricted; base workspace data is preserved. Month-end renewals retain the original billing-day anchor.

Automatic SaaS debit attempts have one reference per invoice. An uncertain result is verified, not automatically charged again. A failed automatic debit requires the owner to review and initiate a fresh hosted checkout. Customer authorizations are saved only when the owner opted in and Paystack marks them reusable. Member split automatic debits remain unavailable pending provider confirmation.

Refund requests use stable references, reserve the refundable balance under a payment lock and support partial/full refunds. Refund status is re-fetched from Paystack; signatures alone do not mark refunds processed. Commission reversals use cumulative refunded amounts to avoid rounding drift. Original invoice/receipt history is retained. Existing refunds and external/manual Paystack refunds require reconciliation; the app does not invent local refund records for unknown transactions.

Settlement reconciliation checks a completed settlement's association with the gym's provider subaccount and verifies included transactions. It covers settlements in the latest 100 records and up to 10,000 transactions per selected settlement. Larger/historical batches need an operational reconciliation process. Dispute webhooks re-fetch the provider record and flag payments for review; dispute evidence submission and chargeback financial adjudication remain operator work.

## Notifications, audit and operations

Notifications are **in-app**, visible to owners in settings and members in billing. No email/SMS provider is configured, and no external messages are sent by this implementation. Add an authorized delivery integration and delivery/retry tracking before promising email/SMS reminders.

Sensitive commercial changes append timestamped audit events in the same transaction. An immutable-table trigger rejects update/delete. Use a production runtime database role that cannot alter/drop triggers, truncate the audit table, or perform migrations. Retain logs under the organization's agreed retention policy. Member deactivation preserves invoices and payment history rather than cascading their deletion.

The in-process login/reauthentication limiter protects one process. A production cluster needs shared gateway/Redis rate limiting. Deploy password/email recovery only with verified owner/admin identity checks and an audited operator process; there is intentionally no unauthenticated MFA reset or impersonation bypass. Authenticator apps are no longer required; historical encrypted authenticator secrets are retained but are not used for sign-in.

Back up PostgreSQL and encryption secrets with restricted access; test restore into an isolated environment. On an incident, disable the affected administrator or gym, revoke sessions, pause the billing worker, preserve audit/provider references, and reconcile every pending charge before resuming. Operational retention periods, POPIA notices/consent, tax/VAT documents, incident response ownership, and Paystack merchant approval require business review; code alone does not establish compliance or production readiness.

## Verification

`npm.cmd test` runs unit, UI and router tests. Database suites are opt-in and refuse remote hosts/application database names:

```powershell
$env:BILLING_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:55439/fitnexis_billing_test'
$env:COMMERCIAL_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:55439/fitnexis_billing_test_commercial'
npm.cmd test
```

Tests use isolated PostgreSQL databases and mocked Paystack HTTP responses. They do not move money or verify the merchant's real-world eligibility. Confirm actual test-mode bank validation, subaccount creation, checkout, refunds, recurring mandates, webhook retries and settlement reconciliation before activating live payments.

Provider references: [split payments](https://paystack.com/docs/payments/split-payments/), [South African account validation](https://paystack.com/docs/api/verification/), [subaccounts](https://paystack.com/docs/api/subaccount/), [refunds](https://paystack.com/docs/payments/refunds/), [settlements](https://paystack.com/docs/api/settlement/).
