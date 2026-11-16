import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';
import routes from '../src/routes/landingPageRoutes.js';
import { db } from '../src/config/db.js';
import { pages, faqs } from '../src/config/marketing.js';
import { buildSeo, seoHeaders, SITE_ORIGIN } from '../src/config/seo.js';

test('public SEO metadata, graph references, crawl files, localization and private-page boundaries agree', async () => {
  const originalQuery = db.query;
  db.query = async () => ({ rows: [] });
  const app = express(); app.engine('html', ejs.renderFile); app.set('view engine', 'html');
  app.set('views', fileURLToPath(new URL('../src/views', import.meta.url)));
  app.use(cookieParser(), seoHeaders);
  app.use('/assets', express.static(fileURLToPath(new URL('../src/views/assets', import.meta.url))));
  app.use((req, res, next) => { if (req.get('x-test-gym')) req.gym = { name: 'Test Gym', slug: 'test-gym' }; next(); });
  for (const path of ['/platform/login', '/member/portal', '/admin/settings', '/security/mfa/platform', '/api/attendance', '/join', '/uploads/profile-pics/test.jpg']) app.get(path, (req, res) => res.send('Protected fixture'));
  app.use(routes);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, headers = {}) => new Promise((resolve, reject) => {
    const req = httpRequest(base + path, { headers: { host: 'fitnexis.app', ...headers } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
      response.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
  try {
    const titles = new Set();
    for (const [key, meta] of Object.entries(pages)) {
      const response = await request(meta.path + '?utm_source=test');
      assert.equal(response.status, 200, meta.path);
      const html = await response.text();
      assert.equal(response.headers.get('content-language'), 'en-ZA');
      assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
      assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
      assert.ok(html.includes(`href="${SITE_ORIGIN}${meta.path}"`));
      assert.ok(!html.includes('utm_source=test'));
      assert.match(html, /twitter:card" content="summary_large_image/);
      assert.match(html, /og:locale" content="en_ZA/);
      assert.ok(!titles.has(meta.title)); titles.add(meta.title);
      const script = html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/);
      assert.ok(script, key);
      const graph = JSON.parse(script[1])['@graph'];
      const ids = new Set(graph.map(node => node['@id']));
      assert.equal(ids.size, graph.length);
      for (const node of graph) {
        for (const property of ['publisher', 'isPartOf', 'about', 'breadcrumb']) if (node[property]?.['@id']) assert.ok(ids.has(node[property]['@id']), `${key}: ${property}`);
      }
      assert.equal(graph.find(node => node['@type'] === 'WebApplication').operatingSystem, 'Web');
      assert.ok(graph.every(node => !node.aggregateRating && !node.offers && !node.address));
      if (key === 'faq') {
        const questions = graph.find(node => node['@type'] === 'FAQPage').mainEntity;
        assert.deepEqual(questions.map(q => [q.name, q.acceptedAnswer.text]), faqs.map(f => [f.question, f.answer]));
        assert.ok(faqs.every(f => html.includes(f.question)));
      }
      if (key !== 'home') assert.match(html, /aria-label="Breadcrumb"/);
      assert.match(response.headers.get('x-robots-tag'), meta.noindex ? /^noindex/ : /^index/);
    }
    const sitemap = await (await request('/sitemap.xml')).text();
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    assert.deepEqual(new Set(locations), new Set(Object.values(pages).filter(p => !p.noindex).map(p => SITE_ORIGIN + p.path)));
    assert.ok(!/find-gym|platform|\/join|lastmod/.test(sitemap));
    const robots = await (await request('/robots.txt')).text();
    assert.ok(robots.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));
    assert.ok(!/Disallow: \/\s*$/m.test(robots));
    for (const path of ['/platform/login', '/member/portal', '/admin/settings', '/security/mfa/platform', '/api/attendance', '/join', '/uploads/profile-pics/test.jpg']) assert.match((await request(path)).headers.get('x-robots-tag'), /^noindex/);
    const mirror = await request('/', { host: 'fitnexis-gym-saas.onrender.com' });
    assert.match(mirror.headers.get('x-robots-tag'), /^noindex/);
    assert.ok((await mirror.text()).includes('href="https://fitnexis.app/"'));
    const www = await request('/features', { host: 'www.fitnexis.app' });
    assert.equal(www.status, 308); assert.equal(www.headers.get('location'), SITE_ORIGIN + '/features');
    assert.equal((await request('/home')).status, 301);
    assert.equal((await request('/features', { 'x-test-gym': '1' })).headers.get('location'), SITE_ORIGIN + '/features');
    assert.equal((await request('/sitemap.xml', { 'x-test-gym': '1' })).status, 404);
    assert.equal((await request('/llms.txt', { 'x-test-gym': '1' })).status, 404);
    assert.ok(!(await (await request('/robots.txt', { 'x-test-gym': '1' })).text()).includes('Sitemap:'));
    const guide = await (await request('/llms.txt')).text();
    assert.ok(guide.startsWith('# Fitnexis'));
    assert.ok(guide.includes('self-service spreadsheet imports are not currently offered'));
    for (const url of guide.matchAll(/\]\((https:\/\/fitnexis\.app[^)]+)\)/g)) assert.equal((await request(new URL(url[1]).pathname)).status, 200);
    const png = await request('/assets/marketing/fitnexis-social.png');
    assert.equal(png.status, 200);
    const bytes = Buffer.from(await png.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), 1200); assert.equal(bytes.readUInt32BE(20), 630);
    assert.equal((await request('/assets/marketing/fitnexis-logo.svg')).status, 200);
  } finally {
    db.query = originalQuery;
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
});

test('structured data safely escapes script-breaking content and excludes invalid ownership tokens', () => {
  const text = '</script><script>alert("unsafe")</script>&\u2028';
  const seo = buildSeo('home', { path: '/', title: text, description: text }, [], { env: { GOOGLE_SITE_VERIFICATION: '<bad>', BING_SITE_VERIFICATION: 'ABCDEF1234567890' } });
  assert.ok(!seo.structuredData.includes('</script>'));
  const graph = JSON.parse(seo.structuredData)['@graph'];
  assert.equal(graph.find(node => node['@type'] === 'WebPage').description, text);
  assert.equal(seo.googleVerification, null); assert.equal(seo.bingVerification, 'ABCDEF1234567890');
  const image = fs.readFileSync(new URL('../src/views/assets/marketing/fitnexis-social.png', import.meta.url));
  assert.ok(image.length < 500000, 'Keep the social preview reasonably small.');
});
