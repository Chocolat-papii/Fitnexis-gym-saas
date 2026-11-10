Fitnexis platform administration is available at `/platform`, with sign-in at `/platform/login` on your existing app host (for local development, `http://localhost:3000/platform`). Gym admin and member accounts cannot access it.

Setup:

1. Run `npm run migrate` against the intended database. This applies all pending migrations, including any billing changes.
2. Set `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_NAME`, and `PLATFORM_ADMIN_PASSWORD` in your local environment. Choose a password of at least 12 characters and no more than 72 UTF-8 bytes. The existing `JWT_SECRET` must also be configured.
3. Run `node scripts/create-platform-admin.js`. It stores a bcrypt password hash and leaves existing accounts unchanged. Remove the provisioning password from your environment afterward.
4. Start the app normally and sign in at `/platform/login`.

The dashboard shows all gyms, searchable in pages of 25; total and active members (based on `users.status`); check-ins and successful ZAR collections for the last 30 days; six months of gym/member registrations; and the ten latest platform admin sessions. Collections are gym receipts, not Fitnexis subscription revenue. Calendar labels and displayed times use Africa/Johannesburg. Gym member and gym admin login history is not tracked by this feature.

Use **Add gym** (`/platform/gyms/new`) to register a gym and its first gym administrator. Only platform administrators can submit to `/platform/gyms`, and the form requires a CSRF token. Gym and administrator creation run in one transaction, so a failed administrator insert cannot leave an orphan gym. The gym contact email is stored separately from the administrator email. Slugs must be unique, lowercase subdomains with letters, numbers and single hyphens; platform names are reserved. Initial administrator passwords require at least 12 characters, up to 72 UTF-8 bytes. Validation errors preserve the other form fields but never the password. Creating a gym keeps your current platform session intact.

The old public `/register-gym` page and `/register` POST endpoint have been removed. Register gyms from the platform workspace instead.

**Billing** (`/platform/billing`) is a protected placeholder for future Fitnexis subscription plans, invoices and payments. It does not create subscriptions or collect charges yet. The existing gym member billing pages are unchanged. No additional migration is required for gym registration or the platform billing placeholder.

Website enquiries are available at `/platform/enquiries`. Apply `202611100001_platform_enquiries.js` to enable the public contact form and this inbox. Administrators can read visitor requests and mark them reviewed; no outbound messages are sent automatically. See `docs/MARKETING_SITE.md` for public website setup and content.

Platform identities live in separate `platform_admins` and `platform_sessions` tables. Two-hour sessions use a separate HttpOnly, SameSite=Strict cookie, secure in production. Signing out revokes the database session immediately. Setting a platform admin's `is_active` to false blocks all their sessions on the next request. Forms require CSRF tokens. Login attempts are limited to ten per IP per fifteen minutes per server process; use shared rate limiting at your ingress when running multiple instances. Session history records explicit logout separately from expiry.

No default administrator is created at application startup. The provisioning command does not reset passwords. No production data or migrations are changed merely by adding these files.
