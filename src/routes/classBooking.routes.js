import express from "express";

import { createBooking, getMyBookings } from "../controllers/classBookings.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireGym } from "../middleware/gym.middleware.js";
import { billingCsrf } from '../middleware/billingCsrf.js';
import {requireFeature} from '../services/saasBilling.service.js';

const router = express.Router();

// class bookings

router.post("/book", requireGym, requireAuth, billingCsrf, requireFeature('classes'), createBooking);
router.get("/my-bookings", requireGym, requireAuth, getMyBookings);

export default router;
