export const viewGymHome = async (req, res, next) => {
  try {

    // no gym = platform page
    if (!req.gym) {
      return ("landing/index");
    }

    // tenant gym page
    return res.render("landing/partials/home", {
      gym: req.gym,
    });

  } catch (err) {
    next(err);
  }
};