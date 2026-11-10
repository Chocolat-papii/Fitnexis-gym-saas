import { renderMarketing } from '../../marketing.controller.js';
export const viewHomePage = async (req, res, next) => {
   return renderMarketing(req, res, 'home');

};

