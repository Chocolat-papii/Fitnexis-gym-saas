import { dirname } from "path";
import { fileURLToPath } from "url";
import path from "path";
import { csrfToken } from '../../middleware/billingCsrf.js';


const __dirname = dirname(fileURLToPath(import.meta.url));

export const viewMemberActivities = async (req, res, next) => {

   return res.render("dashboard/member-activities", {
    activePage: "activities",
    csrf: csrfToken(req),
    gym: req.gym
  });
};
