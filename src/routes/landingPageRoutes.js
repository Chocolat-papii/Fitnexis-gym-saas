import express from "express";
import { viewGymHome } from "../controllers/landing/gymHome/gymHomePage.controller.js";
import { marketingPage, showContact, submitContact, contactThanks, showGymFinder, findGym } from '../controllers/marketing.controller.js';
import { pages } from '../config/marketing.js';
import { SITE_ORIGIN, PRODUCT_DESCRIPTION, robotsText } from '../config/seo.js';


const router = express.Router();
const marketingPaths = Object.values(pages).map(page => page.path);
router.use((req, res, next) => {
  if (['GET', 'HEAD'].includes(req.method)) {
    if (req.hostname === 'www.fitnexis.app' && (marketingPaths.includes(req.path) || ['/home', '/robots.txt', '/sitemap.xml', '/llms.txt'].includes(req.path))) return res.redirect(308, SITE_ORIGIN + (req.path === '/home' ? '/' : req.originalUrl));
    if (req.gym && req.path !== '/' && marketingPaths.includes(req.path)) return res.redirect(308, SITE_ORIGIN + req.originalUrl);
  }
  next();
});

router.get('/', viewGymHome);
for (const page of ['features', 'about', 'pricing', 'faq']) router.get('/' + page, marketingPage(page));
router.get('/gym-management-software-south-africa', marketingPage('south-africa'));
router.get('/contact', showContact);
router.post('/contact', submitContact);
router.get('/contact/thank-you', contactThanks);
router.get('/get-started', (req, res) => res.redirect('/contact?interest=early-access'));
router.get('/find-gym', showGymFinder);
router.get('/find-gym/search', findGym);
router.get('/login', (req, res, next) => req.gym ? next() : res.redirect('/find-gym'));
router.get('/signup', (req, res, next) => req.gym ? next() : res.redirect('/get-started'));
router.get('/sitemap.xml', (req, res) => {
  if (req.gym) return res.status(404).set('X-Robots-Tag', 'noindex').send('Not found');
  res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    Object.values(pages).filter(page => !page.noindex).map(page => `<url><loc>${SITE_ORIGIN}${page.path}</loc></url>`).join('') + '</urlset>');
});
router.get('/robots.txt', (req, res) => res.type('text/plain').send(robotsText({ tenant: !!req.gym })));
router.get('/llms.txt', (req, res) => {
  if (req.gym) return res.status(404).set('X-Robots-Tag', 'noindex').send('Not found');
  res.type('text/plain').send(`# Fitnexis\n\n> ${PRODUCT_DESCRIPTION}\n\n## Product information\n\n${Object.values(pages).filter(page => !page.noindex).map(page => `- [${page.label}](${SITE_ORIGIN}${page.path}): ${page.description}`).join('\n')}\n\n## Availability and boundaries\n\n- Gym registrations are reviewed before activation. Registration alone does not charge a subscription.\n- Published plans and current prices are on the pricing page; do not infer unpublished prices.\n- Online collections use Paystack and depend on each gym's payment configuration and eligibility.\n- Native mobile apps and self-service spreadsheet imports are not currently offered.\n- The homepage dashboard is an illustrative concept; its figures are not customer results.\n- Gym, member and platform administration require authentication. They are not public product documentation.\n\nThis file is an informational directory, not a guarantee of inclusion in AI answers.\n`);
});



router.get('/home', (req, res) => req.gym ? viewGymHome(req, res) : res.redirect(301, '/'));






export default router;
