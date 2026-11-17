# Fitnexis search and AI discovery

The canonical public site is `https://fitnexis.app`. The implementation targets independent gyms in South Africa, uses `en-ZA`, and describes available workflows without inventing customer results, prices, reviews, offices or compliance certifications. GEO here means generative engine optimization: making accurate product information easy to find, read and cite.

## Search intent and content ownership

These are intent hypotheses based on the product, not measured keyword volumes or ranking estimates. Validate them using Search Console query data after indexing.

| Page | Primary intent | Content role |
| --- | --- | --- |
| `/` | Gym management software for independent gyms | Explain the product and its audience; link to capabilities, pricing and onboarding. |
| `/gym-management-software-south-africa` | Gym management software in South Africa | Explain ZAR records, cash/EFT handling, online-payment prerequisites and onboarding. |
| `/features` | Gym membership, attendance, billing and booking tools | Separate implemented capabilities from roadmap items. |
| `/pricing` | Gym software plans and cost | Display published plans from the application; avoid unannounced price claims. |
| `/faq` | Product and onboarding questions | Give direct answers using the same facts used in FAQ structured data. |
| `/about` | Fitnexis brand and purpose | Explain who the software serves without inventing a legal company profile. |
| `/contact` | Request a walkthrough | Provide the next step for an interested gym owner. |

Keep these pages distinct rather than producing many near-identical city or keyword pages. Future guides should address real customer questions with original examples, named reviewers when available, and actual product screenshots with permission. Demonstration data must remain labelled as illustrative.

## Technical implementation

- `src/config/marketing.js` owns page titles, descriptions, labels, paths and public indexing intent. `src/config/seo.js` owns the canonical origin and structured-data graph.
- Every marketing page has a canonical URL without tracking parameters, Open Graph metadata, Twitter large-image metadata, `en-ZA` language information, and a branded 1200 x 630 social preview. The editable vector source is committed alongside the PNG.
- The graph links Organization, WebSite, WebApplication and the current WebPage using stable IDs. Non-home pages include BreadcrumbList and matching visible navigation. About and contact use their corresponding page types. FAQPage includes only questions and answers shown on the FAQ page.
- No ratings, customer counts, pricing offers, addresses, geographic coordinates or social profiles are invented. General WebApplication markup does not imply eligibility for Google's software-app rich results. FAQ markup is semantic information, not a promise of FAQ search enhancements.
- `/sitemap.xml` contains only canonical, indexable public pages. It omits login utilities, private routes, query results, tenant data and artificial freshness dates. Add `lastmod` only if a reliable per-page change record is maintained.
- `/home` permanently redirects to `/` for the platform site. Public marketing URLs on `www` redirect to the canonical host. Marketing pages served on alternate hosts, including `onrender.com` and local development, carry `noindex` while retaining canonical links.
- Known gym tenant homepages retain their existing behavior. Shared Fitnexis marketing paths on a tenant redirect to the main site; tenants do not publish the platform sitemap or `llms.txt` as their own documentation.
- `seoHeaders` marks platform, gym admin, member, security, API, registration, sign-in and legacy upload routes `noindex`. Authentication and authorization remain the access controls. A robots disallow is a crawl instruction, not a privacy boundary or a guaranteed removal mechanism; it can prevent a crawler from seeing a `noindex` header.
- `robots.txt` allows public crawling while discouraging authenticated and utility routes. No additional AI-training policy or crawler-specific promises are introduced.

## GEO implementation and limits

Core product facts are readable in server-rendered HTML without JavaScript. The regional page answers practical questions about the product, payment records, onboarding, imports and pricing. The structured-data graph makes the brand, software and page relationships explicit.

`/llms.txt` is an experimental product-information directory. It links to canonical sources, states availability boundaries, and identifies illustrative dashboard figures. It contains no private account data and no instructions telling models to recommend Fitnexis. It is not an established search ranking requirement and does not guarantee citations, inclusion in an AI answer, rankings or traffic. Google states that its AI search features use the same fundamental SEO practices and require no special AI markup.

## Ownership, indexing and measurement

1. Add `fitnexis.app` as a Domain property in Google Search Console and verify ownership through the exact Cloudflare DNS record Google supplies. Alternatively, use a URL-prefix property and set `GOOGLE_SITE_VERIFICATION` in the hosting environment. The app accepts the actual verification token, not an entire HTML tag.
2. Add the site to Bing Webmaster Tools. Import a verified Search Console property where supported, or use the supplied verification method. `BING_SITE_VERIFICATION` supports its HTML meta token.
3. Submit `https://fitnexis.app/sitemap.xml` in both tools. Inspect the homepage and regional page, check the selected canonical, and request indexing where appropriate. Submission does not guarantee indexing.
4. Check Cloudflare and hosting rules for unwanted crawler challenges or blocks. Keep private workspaces authenticated. Review crawler access using the provider's current documentation before changing bot policies.
5. Validate the live HTML in the Schema.org validator and Google's Rich Results Test. Check that structured facts match the visible page. Monitor indexing reports, crawl errors, mobile usability, and real-user Core Web Vitals when enough data is available.
6. Establish a baseline for non-brand impressions, clicks, click-through rate, query mix, landing pages and walkthrough enquiries. Compare subsequent periods only after recrawling and sufficient traffic; do not present inferred gains as measured results.
7. Review relevant AI answers manually against the public product facts. Record the question, date, service, cited URL and factual errors. Citation changes are observations, not controlled proof that an individual markup change caused them.

The code does not register webmaster accounts, change Cloudflare DNS, submit a sitemap, fabricate verification tokens, add tracking scripts or promise ranking improvements. Those account-level actions need the owner's authenticated account and, where applicable, consent choices for analytics. Free-host cold starts can increase response time, and sleeping processes do not run background jobs continuously; measure actual availability before relying on them for scheduled work.

## Verification

Run `npm test`. SEO regressions check canonical and query handling, unique metadata, graph relationships, FAQ parity, structured-data escaping, indexing headers, tenant boundaries, sitemap membership, crawlable directory links and social-image dimensions. After deployment, inspect `/`, `/faq`, `/gym-management-software-south-africa`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` and the social image on the canonical domain.

Sources: [Google AI search guidance](https://developers.google.com/search/docs/appearance/ai-features), [canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [robots.txt boundaries](https://developers.google.com/search/docs/crawling-indexing/robots/intro), [site names](https://developers.google.com/search/docs/appearance/site-names), [software-app rich results](https://developers.google.com/search/docs/appearance/structured-data/software-app), [Schema.org WebApplication](https://schema.org/WebApplication).
