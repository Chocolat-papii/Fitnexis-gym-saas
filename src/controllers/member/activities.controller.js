import { dirname } from "path";
import { fileURLToPath } from "url";
import path from "path";


const __dirname = dirname(fileURLToPath(import.meta.url));

export const viewMemberActivities = async (req, res, next) => {

   return ("dashboard/member-activities", { 
    activePage: "activities",
    gym: req.gym
  });
};