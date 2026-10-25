import express from "express";
import { createCheckin, getCheckinStatus } from "../controllers/admin/attendance.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getMyStats } from "../controllers/member/attendance.controller.js";
import { requireGym } from "../middleware/gym.middleware.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = express.Router();

router.post("/checkin", requireGym, requireAuth, requireAdmin, createCheckin);
router.get("/stats", requireGym, requireAuth, requireAdmin, getMyStats);
router.get("/status/:user_id", requireGym, requireAuth, requireAdmin, getCheckinStatus);



export default router;
