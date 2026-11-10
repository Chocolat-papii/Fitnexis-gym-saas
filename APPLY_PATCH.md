# Fitnexis Billing & Payments implementation patch

Target repository: https://github.com/Chocolat-papii/Fitnexis-gym-saas
Target branch: develop (commit 1451817669dd31f81c00d31f93c55b1249d905cb at time of implementation)

This ZIP contains only the files that must be added or replaced; it does not include environment files, credentials, .git or dependencies.

## Apply via VS Code terminal

1. Back up your local working tree and database. Pull the latest `develop` branch.
2. Create a separate feature branch for safety: `git checkout -b feature/billing-payments-complete`.
3. Extract the ZIP contents into your repository root, preserving folder names.
4. Run `npm ci` (if package-lock is present), then `npm test`.
5. Configure test-mode Paystack variables as documented in `docs/BILLING.md`.
6. Run `npm run migrate` against a **staging** PostgreSQL instance, verify migration success and perform Paystack test-mode checkout/webhook tests.
7. Review file differences carefully. Deploy only after successful sandbox verification and a rollback plan.

To publish from your own terminal after testing:

```bash
git add package.json knexfile.js src tests migrations docs/BILLING.md APPLY_PATCH.md
git commit -m "feat(billing): membership billing Paystack and invoices"
git push -u origin feature/billing-payments-complete
```

Then create a pull request into `develop`, or merge with your own repository protections. Do not place Paystack secret keys in source control.

## QA completed in this isolated environment

- `node --check` for all added or modified JavaScript files.
- `npm test` with an isolated local `BILLING_TEST_DATABASE_URL`: 16 passing tests, including PostgreSQL lifecycle, authenticated routes and form interactions.
- EJS compilation and runtime rendering with mock admin/member records.
- Inline browser JavaScript parsed successfully.
- Imports of admin and member route modules successful.

**Not performed for this update:** production database migration, real Paystack checkout, CI on GitHub, browser end-to-end tests, deployment, or GitHub push.

## 9 November 2026 update

The working tree now includes once-off/weekly/monthly/yearly billing cycles, the Create Plan button repair, and paid/free class-session booking with invoice settlement. These changes were applied directly to the repository; no ZIP extraction is needed for this update.

Run `npm run migrate` (or `npm.cmd run migrate` in Windows PowerShell) before starting the updated application. This applies `202611090001_paid_class_sessions.js`, adding session pricing and the booking-to-invoice link. Existing sessions remain free. See `docs/BILLING.md` for payment and reservation behavior.

## Production policy decisions still needed

Automated card debits, provider-issued refunds, tax/VAT handling and external SMS/email dispatch are intentionally disabled. Recurring **invoice generation** and in-app reminders are present. See `docs/BILLING.md` for configuration details.
