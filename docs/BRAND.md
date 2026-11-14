# Fitnexis UI direction

Use the supplied Fitnexis brand references across marketing, gym workspaces, member portals, billing, and authentication.

| Role | Colour |
| --- | --- |
| Primary / electric blue | `#0EA5FF` |
| Secondary / deep blue | `#2563EB` |
| Accent / cyan | `#06D6FF` |
| Charcoal | `#1F2937` |
| Carbon | `#111827` |
| Borders / slate | `#334155` |
| Dividers / light grey | `#E2E8F0` |
| Text on dark | `#F8FAFC` |

Use Montserrat for headings and branding, and Inter for body text, controls, and data. System fonts are the fallback when Google Fonts is unavailable.

Default to charcoal surfaces with subtle borders, clear off-white text, and cyan line icons. Use the cyan → electric blue → deep blue gradient for primary actions and active navigation. Keep semantic payment and validation colours distinct. Preserve gym names and member data. The optional dashboard light theme uses the same blue identity and honours saved preferences.

Shared tokens, typography, and wordmark styles live in `src/views/assets/brand/brand.css`. The scalable mark derived from the references is `fitnexis-mark.svg`; line icons are in `icons.svg` in the same directory. Use accessible text alongside the decorative mark.

Marketing uses `marketing/site.css` and `marketing/brand-theme.css`. Member and gym administration share `dashboard/css/stylesdash.css`; platform administration uses `platform.css` and `platform-brand.css`. Tenant landing and authentication pages load `landing/css/brand-theme.css` after their legacy styles.

Keep future components responsive, keyboard accessible, and consistent with these shared assets. Product previews must continue to identify sample data and planned capabilities.
