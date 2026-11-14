import { Router } from "express";
import { getSignUpForm, signUp} from "../controllers/auth.controller.js";
import { logoutMember } from "../controllers/logout/auth.logout.controller.js";
import { loginMember, loginForm } from "../controllers/login/auth.login.controller.js";
import { redirectLoggedIn } from "../middleware/requireAdmin.js";
import { requireGym } from "../middleware/gym.middleware.js";
import { rateLimit } from '../middleware/rateLimit.js';
import {sameOrigin} from '../middleware/sameOrigin.js';


const router = Router();

router.get("/signup",requireGym, getSignUpForm);  
router.post("/signup",sameOrigin,rateLimit('member-signup',10,60),requireGym, signUp);


router.get("/login",requireGym, redirectLoggedIn, loginForm);        
router.post("/logged-in",sameOrigin,rateLimit('gym-login'),requireGym, loginMember);

router.get("/logout",requireGym, logoutMember)

export default router;
