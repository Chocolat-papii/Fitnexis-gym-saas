import express from "express";
import { connectDB } from "./config/db.js";
import { dirname } from "path";
import { fileURLToPath } from "url";
import path from "path";
import ejs from "ejs";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import logger from "./middleware/logger.middleware.js";
import landingPageRoutes from "./routes/landingPageRoutes.js";
import memberPageRoutes from "./routes/dashboardPageRoutes.js";
import adminPageRoutes from "./routes/admin.routes.js";
import dotenv from "dotenv";
import {requireAuth } from "./middleware/requireAuth.js";
import { hydrateMember } from "./middleware/hydrateMember.js";
import { seedAdmin } from "./utilities/seedAdmin.js";
import sessionsRoutes from './routes/sessions.router.js';
import classBookingRoutes from "./routes/classBooking.routes.js";
import { requireAdmin } from "./middleware/requireAdmin.js";
import attendanceRoutes from "./routes/attendance.router.js"
import { requireGym } from "./middleware/gym.middleware.js";
import { paystackWebhook } from "./controllers/paystackWebhook.controller.js";
import { startBillingJobs } from "./services/billingJobs.service.js";
import platformRoutes from "./routes/platform.routes.js";
import securityRoutes from './routes/security.routes.js';
import gymRegistrationRoutes from './routes/gymRegistration.routes.js';




const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config();
const app = express();
app.set('trust proxy', 1);
app.use((req,res,next)=>{
  if(process.env.NODE_ENV==='production'&&!req.secure)return res.status(426).send('Use HTTPS to access Fitnexis.');
  res.set('X-Content-Type-Options','nosniff');
  if(req.secure)res.set('Strict-Transport-Security','max-age=31536000');
  next();
});
// Raw body must be preserved for Paystack HMAC verification.
app.post("/api/billing/paystack/webhook", express.raw({ type: "application/json", limit: "200kb" }), paystackWebhook);

// database

await connectDB();

//seeding

if (process.env.NODE_ENV !== "production") {
  await seedAdmin();
}
startBillingJobs();

// ----- middlewares ---- //
app.use(logger);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set("trust proxy", 1);
app.engine("html", ejs.renderFile);
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "html");

app.use(cookieParser());

// serve /assets
app.use("/assets", express.static(path.join(__dirname,  "views", "assets")));
app.use(express.static(path.join(process.cwd(), "public")));

// Platform administration has its own identity and must not inherit a gym context.
app.use('/platform', platformRoutes);
app.use(requireGym);
app.use('/security', securityRoutes);
app.use('/join', gymRegistrationRoutes);

//
app.use((req,res,next)=>{
  console.log("REQUEST:", req.method, req.url);
  next();
});

// ----- routes ---- //

// app.use(attachUser); 
app.use(landingPageRoutes);
app.use(authRoutes);
app.use("/api/sessions", sessionsRoutes);
app.use("/api/class-bookings", classBookingRoutes);
app.use("/member", requireAuth, hydrateMember, memberPageRoutes);
app.use("/admin", requireAuth, requireAdmin, hydrateMember, adminPageRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/member/attendance", memberPageRoutes);




// 404 fallback 
app.use((req, res) => res.status(404).send("404 Not Found"));

export default app;
