// routes/sessions.routes.js
import express from "express";
import { getSessions } from "../controllers/classSession.controller.js";
import { requireAuth } from '../middleware/requireAuth.js';
import { requireGym } from "../middleware/gym.middleware.js";

const router = express.Router();

router.get("/", requireGym, (req, res, next) => req.cookies?.token ? requireAuth(req, res, next) : next(), getSessions);

export default router;
