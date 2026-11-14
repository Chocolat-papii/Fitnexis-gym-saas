The public Fitnexis site is served by the existing Express/EJS app. No new frontend dependencies or separate deployment are required.

Pages: `/` (home), `/features`, `/about`, `/pricing`, `/faq`, `/contact`, `/get-started` (early access enquiry), and `/find-gym`. Existing gym subdomains continue to use their own home, signup, login and member/admin portals. The platform root `/login` redirects to the gym finder. Gym registration stays protected inside `/platform/gyms/new`.

Content is organised around five pillars: gym operations, financial management, member engagement, classes and bookings, and business intelligence. Shared content and SEO metadata live in `src/config/marketing.js`; layouts and pages live in `src/views/marketing`; shared assets live in `src/views/assets/marketing`. The site is self-contained, with no external fonts, analytics or UI CDN dependencies. Photography reuses an existing repository asset.

The dashboard on the homepage is an interactive concept, with keyboard-accessible tabs for Overview, Money and Classes. All figures are illustrative; the combined health dashboard, automated member follow-ups, expense/profit reporting and retention intelligence remain explicitly planned. Current product tools are described separately from future plan entitlements. Core administration and attendance are positioned as free; paid pricing is unannounced and no platform checkout is enabled.

Contact form setup:

1. Run `npm run migrate` against your local database to apply `202611100001_platform_enquiries.js` (along with any other pending migrations). To apply only this migration in an already-migrated database, use `npx knex migrate:up 202611100001_platform_enquiries.js`.
2. Visitors can submit early access, walkthrough, pricing and support enquiries. Valid submissions are stored in `platform_enquiries`, then the browser redirects to a confirmation page. Database failures show an error and preserve form input.
3. Platform administrators review enquiries at `/platform/enquiries` and mark them reviewed. Messages are escaped when rendered. No email, Slack or other outbound notifications are sent automatically.

The contact form requires a CSRF cookie/token and consent to save and respond to the enquiry. It includes a honeypot and a limit of five valid submission attempts per IP per hour per process. Shared rate limiting at the ingress is appropriate for multiple app instances. The form explains the data it stores and does not opt visitors into marketing. Establish your organisation's full privacy and retention policy before a public launch; no legal compliance claims are made by this implementation.

The gym finder looks up an exact validated gym slug. In local development, it links to `<slug>.localhost:<port>/login`; in production it links to `<slug>.fitnexis.app/login`. Unknown slugs display a useful error and do not redirect. SEO canonical URLs, social metadata and the sitemap use `https://fitnexis.app`, matching the existing production root domain. Update these if the production domain changes. The site also serves `/robots.txt` and `/sitemap.xml`.

The design supports mobile and desktop, visible keyboard focus, a skip link, native FAQ disclosures, a mobile navigation menu, reduced motion, and core content/navigation without JavaScript. Contact form submissions are standard browser POSTs. Native browser validation is backed by server validation.
