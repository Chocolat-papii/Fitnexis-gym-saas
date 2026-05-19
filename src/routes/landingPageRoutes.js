import { viewHomePage } from "../controllers/landing/home/homePageController.js";
import { getSessions } from "../controllers/classSession.controller.js";

import express from "express";
import { requireGym } from "../middleware/gym.middleware.js";
import { registerGym, viewRegisterPage } from "../controllers/registration/registerGym.controller.js";
import { viewGymHome } from "../controllers/landing/gymHome/gymHomePage.controller.js";


const router = express.Router();

router.get("/", requireGym, viewHomePage); // Show fitnexis landing page
router.get("/", requireGym, getSessions); //Show sessions on home page


router.get("/register-gym", viewRegisterPage) // Show gym registeration page
router.post("/register", registerGym); // register gym

router.get("/home", requireGym, viewGymHome)






export default router;