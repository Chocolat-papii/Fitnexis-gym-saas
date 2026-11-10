import { renderMarketing } from '../../marketing.controller.js';

export const viewGymHome = async (req, res, next) => {
  try {

    // no gym = platform page
    if (!req.gym) {
      return renderMarketing(req, res, 'home');
    }

    // tenant gym page
    return res.render("landing/partials/home", {
      gym: req.gym,
    });

  } catch (err) {
    next(err);
  }
};
