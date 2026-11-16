export const SITE_ORIGIN = 'https://fitnexis.app';
export const SOCIAL_IMAGE = `${SITE_ORIGIN}/assets/marketing/fitnexis-social.png`;
export const PRODUCT_DESCRIPTION = 'Fitnexis is browser-based gym management software for independent gyms and fitness businesses in South Africa. It brings member records, attendance, membership billing, class bookings and member portals into gym-specific workspaces.';

export function serializeStructuredData(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function buildSeo(page, meta, faqs = [], { noindex = false, env = process.env } = {}) {
  const canonical = SITE_ORIGIN + meta.path;
  const organization = { '@type': 'Organization', '@id': SITE_ORIGIN + '/#organization', name: 'Fitnexis', url: SITE_ORIGIN + '/', logo: { '@type': 'ImageObject', url: SITE_ORIGIN + '/assets/marketing/fitnexis-logo.svg', width: 160, height: 160 }, description: PRODUCT_DESCRIPTION, areaServed: { '@type': 'Country', name: 'South Africa' } };
  const website = { '@type': 'WebSite', '@id': SITE_ORIGIN + '/#website', name: 'Fitnexis', url: SITE_ORIGIN + '/', publisher: { '@id': organization['@id'] }, inLanguage: 'en-ZA' };
  const software = { '@type': 'WebApplication', '@id': SITE_ORIGIN + '/#software', name: 'Fitnexis', url: SITE_ORIGIN + '/', description: PRODUCT_DESCRIPTION, applicationCategory: 'BusinessApplication', applicationSubCategory: 'Gym management software', operatingSystem: 'Web', browserRequirements: 'A modern web browser', inLanguage: 'en-ZA', publisher: { '@id': organization['@id'] }, featureList: ['Member records and attendance tracking', 'Membership invoices and payment records', 'Class scheduling and bookings', 'Gym administrator and member portals'] };
  const webPage = { '@type': page === 'faq' ? 'FAQPage' : page === 'about' ? 'AboutPage' : page === 'contact' ? 'ContactPage' : 'WebPage', '@id': canonical + '#webpage', url: canonical, name: meta.title, description: meta.description, inLanguage: 'en-ZA', isPartOf: { '@id': website['@id'] }, about: { '@id': software['@id'] }, primaryImageOfPage: { '@type': 'ImageObject', url: SOCIAL_IMAGE, width: 1200, height: 630 } };
  const graph = [organization, website, software, webPage];
  if (page === 'home') webPage.mainEntity = { '@id': software['@id'] };
  if (page === 'faq') webPage.mainEntity = faqs.map(faq => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } }));
  if (page !== 'home') {
    const breadcrumb = { '@type': 'BreadcrumbList', '@id': canonical + '#breadcrumbs', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN + '/' }, { '@type': 'ListItem', position: 2, name: meta.label || meta.title.split('|')[0].trim(), item: canonical }] };
    graph.push(breadcrumb); webPage.breadcrumb = { '@id': breadcrumb['@id'] };
  }
  const verification = value => /^[A-Za-z0-9_-]{10,200}$/.test(value || '') ? value : null;
  return { canonical, socialImage: SOCIAL_IMAGE, robots: noindex || meta.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1', structuredData: serializeStructuredData({ '@context': 'https://schema.org', '@graph': graph }), googleVerification: verification(env.GOOGLE_SITE_VERIFICATION), bingVerification: verification(env.BING_SITE_VERIFICATION) };
}

export function seoHeaders(req, res, next) {
  if (/^\/(platform|admin|member|security|api|join|login|signup|uploads)(\/|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow, nosnippet');
  else if (/^\/find-gym(?:\/|$)/.test(req.path) || req.path === '/contact/thank-you') res.set('X-Robots-Tag', 'noindex, follow');
  next();
}

export function robotsText({ tenant = false } = {}) {
  return ['User-agent: *', 'Allow: /', 'Disallow: /platform', 'Disallow: /admin', 'Disallow: /member', 'Disallow: /security', 'Disallow: /api/', 'Disallow: /uploads/', 'Disallow: /find-gym/search', 'Disallow: /contact/thank-you', ...(tenant ? [] : [`Sitemap: ${SITE_ORIGIN}/sitemap.xml`]), ''].join('\n');
}
