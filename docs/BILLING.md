# Fitnexis Billing & Payments

## What is implemented

- Gym-specific pricing plans, plan activation and membership assignment.
- Once-off, weekly, monthly and yearly plans. Existing quarterly and annual plans remain supported; annual is displayed as yearly.
- Paid/free class-session switch and per-member ZAR pricing on Classes & Activities. Paid bookings create invoices and confirm only after full payment.
- Member billing views, real invoice history, plan-change requests.
- Automated recurring invoice creation, guarded by unique membership / billing-period keys and row locks.
- Cash/EFT payment recording, unique references, partial payments and paid balances.
- Paystack hosted checkout, subaccount routing, callback verification and signed webhooks.
- Printable invoices with settled payment history; browser **Print / Save as PDF**.
- Admin KPIs, invoices, payments, plan requests, in-app reminder queue and CSV exports.
- Tenant isolation using `gym_id`, CSRF protection for all new member/admin billing mutations.
- Member payment history and plan-request history, with payment verification controls in both portals.
- Shared responsive layout, theme-aware tables/cards/buttons and a billing shell script for theme persistence and mobile navigation.

## Before enabling

1. Back up PostgreSQL and run `npm run migrate` in staging before production.
2. Set `PAYSTACK_SECRET_KEY=sk_test_...` in your server environment (never in source control).
3. In the Paystack dashboard configure webhook URL `https://YOUR-APP-HOST/api/billing/paystack/webhook`.
4. Optionally set `PAYSTACK_CALLBACK_URL=https://YOUR-GYM-HOST/member/billing/return`. For multi-tenant custom domains configure the callback to the same host that owns the member's login session. Without an explicit callback, Paystack uses the account's dashboard settings and payment status is reconciled by webhooks.
5. Under `/admin/billing`, configure the gym's Paystack subaccount. Online payments are disabled unless a subaccount is set. For explicit platform-wide collections only, set `ALLOW_PLATFORM_COLLECTION=true`.
6. Set `ENABLE_BILLING_JOBS=true` on exactly one **worker** process to generate due invoices every 30 minutes. In multi-instance deployments, use an external scheduled job or one dedicated worker; row locks and unique indexes prevent duplicate invoices but multiple workers waste work.
7. `npm test` runs unit and template tests. The PostgreSQL lifecycle test runs when `BILLING_TEST_DATABASE_URL` points at an isolated local database (see below). Complete Paystack test-mode checkout on the deployed gym domain before accepting real payments.

On Windows PowerShell, use `npm.cmd` if the machine's execution policy blocks `npm.ps1`.
Production runtime and Knex migrations both use `PROD_DATABASE_URL`, falling back to `DATABASE_URL`.

## Payment flow

1. Member visits `/member/billing` and clicks **Pay now** for a due invoice.
2. Server checks the member, gym, outstanding balance, configured subaccount, and writes a pending payment with a unique reference.
3. Server initializes Paystack checkout with server-calculated amount (cents). Member completes checkout on the Paystack-hosted URL.
4. Signed webhook triggers `GET /transaction/verify/:reference` on Paystack's server. Only verified ZAR amounts and references are marked succeeded. Replayed events are idempotent.
5. Invoice status becomes paid once the total successful payments covers the amount. Manual EFT/cash receipts are recorded by admins and do not pretend to be Paystack transactions.
6. Member and admin **Check status** controls verify pending payments with Paystack. Retrying an existing pending checkout verifies and reuses its reference. Manual receipts are blocked while an online payment is pending for the same invoice.

## Billing rules

- Billing dates and month boundaries use `Africa/Johannesburg`, including when PostgreSQL runs in UTC. An invoice becomes overdue on the day after its due date.
- Once-off plans generate one invoice, then clear the next billing date and stop automatic invoicing. Weekly plans advance seven calendar days. Yearly plans preserve their original anniversary, clamping leap-day anniversaries as needed.
- Monthly dates preserve the original billing day, clamping shorter months to their final day.
- Each run handles up to 200 due memberships, catching up at most 120 periods per membership. Further runs handle remaining backlog. Membership end dates cap invoice generation.
- Assigning or approving a replacement plan replaces both active and paused memberships. Existing invoices remain payable. Approval starts the new plan today; there is no automatic credit or prorating.
- Resuming a paused membership advances an outdated next billing date to today, preserving the original billing-day anchor for subsequent periods. Paused time is not back-billed.
- Cancelled and replaced memberships cannot be resumed. Assign a new plan instead.
- One member can have one pending plan-change request at a time; concurrent requests are serialized.
- Member balances are calculated from all invoices independently of the 200-row history limit; voided invoices never count as outstanding.
- Existing memberships with `next_bill_on IS NULL` are deliberately not back-billed. Review and reassign their plan with the agreed start date to enroll them in recurring billing.
- This implementation offers online checkout for balances of at least R1; smaller balances can be settled manually.

## UI review

Member billing follows the same layout: top actions open payment and plan-change modals, while the main page shows the membership, outstanding balance and next steps. Invoice, payment and plan-request histories use separate tabs. Invoice-row payment buttons preselect that invoice in the payment modal; checkout starts only after confirmation. Session invoice links remain supported, pending payments retain verification controls, and failed plan requests preserve the modal draft. This member layout requires no migration. Its JavaScript/template checks pass; the PostgreSQL integration suite was not rerun for this UI-only revision.

The admin page now opens Create Plan, Assign Plan, Create Invoice, Record Payment, payment settings, plan requests and invoice generation from a top action toolbar. Forms live in Bootstrap modals: successful saves close the form, while failures preserve its values and display the error inside the modal. The overview shows collection totals, overdue balances, pending payments and requests, plus a monthly breakdown by payment method. Records are grouped into tabs with invoice search and status filters. Insights aggregate all gym records; invoice/payment histories show the latest 200. Collection figures are gross confirmed receipts, not net bank settlements. No additional migration is needed for this layout.

The original dashboard stylesheet defined `.sidebar` and `.content` multiple times and used different layouts for `.app` and `.app-shell`. The shared stylesheet now uses one layout with consistent spacing, sidebar sizing and a Bootstrap-aligned mobile breakpoint. Legacy white text, dark tables and outline buttons now follow the selected theme.

Billing previously mixed custom admin cards with member glass cards, used white headings against the default light background, and omitted working theme/menu behavior on the admin page. The member page also duplicated the header's mobile toggle ID. Billing now uses shared spacing, badges, tables, feedback, disabled/empty states and a shell script independent of chart data. Payment forms suppress repeated submission, show remaining invoice balances and offer clear verification controls.

Other dashboard pages still contain their older page-specific navigation/theme scripts. Consolidating these scripts is a separate refactor; shared layout and color fixes apply to them, but a full visual/browser review of every screen has not been performed.

## Class-session payments

Apply `202611090001_paid_class_sessions.js` with `npm run migrate` before using this version. Existing sessions default to free. The Classes navigation link is enabled in the admin sidebar.

1. In **Classes → Create Session**, switch **Paid session** on and enter the per-member price (at least R1). Turn it off for a free session. Editing restores the current payment settings; opening a new session resets the switch to free.
2. The member timetable shows the session price before booking. A free booking confirms immediately without an invoice. A paid booking creates one invoice at the server's saved price and reserves a place with `awaiting_payment` status.
3. The member is taken to the session invoice in Membership & Billing. They can pay online when Paystack is configured, or arrange cash/EFT with the gym. Repeated bookings return the same invoice. Pending timetable entries offer **Pay invoice**.
4. A full confirmed payment changes the booking to `booked` in the same transaction as invoice settlement. Partial payments keep it awaiting payment. Both recorded cash/EFT and server-verified Paystack transactions follow this rule.

Reserved and confirmed bookings both count toward capacity; concurrent requests cannot take the same last place. Reservations do not currently expire automatically. Payment terms cannot be changed after any bookings exist. Sessions with bookings cannot be deleted, and paid sessions with active reservations cannot be cancelled through this form until bookings/refunds are resolved. This release does not add a refund or reservation-cancellation workflow.

The Activities page rendering and timetable success-response mismatch were repaired. The authenticated timetable now recognizes the member's existing confirmed and pending bookings. Session writes and bookings require the session-bound CSRF token.

**Create Plan repair:** creating a plan or configuring settlement no longer depends on all dashboard sections loading successfully. Member-dependent forms remain disabled until their required data is available; save errors and refresh failures are displayed explicitly.

## Verification

The suite was run successfully against an isolated PostgreSQL 18 database with Paystack HTTP responses mocked: 16 tests passed. It covers migrations, missed-period catch-up, once-off/weekly/yearly cycles, duplicate generation and concurrent settlement, partial receipts, amount mismatches, pending-checkout reuse, initialization failures/timeouts, membership transitions, end dates, plan-change races, tenant checks, real authenticated billing/session/booking routes, CSRF and template rendering. Added JavaScript interaction tests cover plan submission during a dashboard-load failure and paid-session form creation/edit/reset. Paid-booking tests cover invoice creation, price tampering, duplicate requests, last-seat races, manual and online confirmation, and payment-history preservation. The application query pool runs in UTC during integration tests to exercise South African calendar handling.

To repeat the database test, create a dedicated local database named `fitnexis_billing_test` (or `fitnexis_billing_test_<suffix>`), set `BILLING_TEST_DATABASE_URL` to its PostgreSQL URL and run `npm test`. The test refuses remote hosts and other database names, applies migrations and removes only its own gym fixture afterward. Without that variable, the integration test is explicitly skipped. No existing application database is required or modified by this test setup.

## Known limitations / next production checks

- In-app reminders are queued in `billing_reminders`. Email/SMS delivery still requires an outbound messaging provider (no credentials or provider were supplied).
- Invoice printing uses the browser's built-in PDF export; no server-side generated PDF or automatic email attachment.
- Paystack automatic card debits, refunds, VAT/tax settings and payout reconciliation are intentionally NOT enabled until payment mandates, tax and settlement policies are agreed. Recurring **invoices** work, not automatic card charges.
- PostgreSQL, router and template tests passed locally. Actual Paystack sandbox checkout, webhook delivery on a public domain and visual browser testing still need to be completed. No live money was transferred by these tests.
- If initialization times out after the provider might have accepted it, the pending reservation is retained to prevent double charging. Check its reference in Paystack before taking another payment. If no checkout URL was saved and the provider cannot verify the reference, an operator must investigate and reconcile it; it is not automatically discarded based on age.
- `PAYSTACK_SECRET_KEY` is platform-level. Gym subaccounts determine settlement. Validate Paystack subaccounts before enabling collection.
- Admin pages rely on the application's existing cookie JWT authentication and role middleware.

Provider references: [Paystack transaction API](https://paystack.com/docs/api/transaction/), [accepting payments](https://paystack.com/docs/payments/accept-payments/), [webhook verification](https://paystack.com/docs/payments/webhooks/).
