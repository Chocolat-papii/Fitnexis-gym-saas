import express from "express";
import { viewGymHome } from "../controllers/landing/gymHome/gymHomePage.controller.js";
import { marketingPage, showContact, submitContact, contactThanks, showGymFinder, findGym } from '../controllers/marketing.controller.js';
import { pages } from '../config/marketing.js';


const router = express.Router();

router.get('/', viewGymHome);
for (const page of ['features', 'about', 'pricing', 'faq']) router.get('/' + page, marketingPage(page));
router.get('/contact', showContact);
router.post('/contact', submitContact);
router.get('/contact/thank-you', contactThanks);
router.get('/get-started', (req, res) => res.redirect('/contact?interest=early-access'));
router.get('/find-gym', showGymFinder);
router.get('/find-gym/search', findGym);
router.get('/login', (req, res, next) => req.gym ? next() : res.redirect('/find-gym'));
router.get('/signup', (req, res, next) => req.gym ? next() : res.redirect('/get-started'));
router.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    Object.values(pages).map(page => `<url><loc>https://fitnexis.app${page.path}</loc></url>`).join('') + '</urlset>');
});
router.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /platform\nDisallow: /admin\nDisallow: /member\nDisallow: /find-gym/search\nDisallow: /contact/thank-you\nSitemap: https://fitnexis.app/sitemap.xml\n'));



router.get('/home', viewGymHome);






export default router;
