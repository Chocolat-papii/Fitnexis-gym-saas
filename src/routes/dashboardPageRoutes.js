
import express from "express";

import { viewMemberPortal } from "../controllers/member/portal.controller.js";
import { viewMemberActivities } from "../controllers/member/activities.controller.js";
import { getMemberDietary, updateMemberDietary, viewMemberNutrition } from "../controllers/member/nutrition.controller.js";
import { deleteEmergencyContact, getEmergencyContacts, updateEmsDetails, updateHealthRecord, updatePersonalDetails, viewMemberPersonalDetails } from "../controllers/member/personalDetails.controller.js";
import { viewEditProfile, updateMemberProfile, updatePassword } from "../controllers/member/editProfile.controller.js";
import { viewMemberBlling, memberInvoice, startCheckout, requestChange, returnFromPaystack, verifyPayment } from "../controllers/member/billing.controller.js";
import { billingCsrf } from "../middleware/billingCsrf.js";
import { viewMemberReports } from "../controllers/member/reports.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { uploadProfilePic } from "../middleware/uploadProfilePic.js";
import { getPhysiqueLifestyle, updatePhysiqueLifestyle } from "../controllers/member/physiqueLifestyleController.js";
import { hydrateMember } from "../middleware/hydrateMember.js";
import { getMyStats } from "../controllers/member/attendance.controller.js";
import { requireGym } from "../middleware/gym.middleware.js";
import {requireFeature} from '../services/saasBilling.service.js';
import {purchaseMembership} from '../services/membershipCheckout.service.js';

const router = express.Router();

router.use("/member", requireGym, requireAuth, hydrateMember); 
//// - - - member dashboard update routes - - - //

// update member's personal details View
router.get("/personal-details", requireAuth, viewMemberPersonalDetails);
router.post("/member-personal-details-update", requireAuth, updatePersonalDetails)
router.get("/member-emergency-contacts", requireAuth, getEmergencyContacts);
router.post("/member-emergency-contact-update", requireAuth, updateEmsDetails)
router.delete("/member-emergency-contact/:id", requireAuth, deleteEmergencyContact);
router.post("/member-health-record", requireAuth, updateHealthRecord)

// member nutritional diet and physique
router.get("/nutrition", requireAuth, viewMemberNutrition, getMemberDietary, getPhysiqueLifestyle);
router.post("/dietary", requireAuth, updateMemberDietary);
router.post("/physiqueLifestyle", requireAuth, updatePhysiqueLifestyle)


// update edit profile routes
router.post("/member-profile-update", requireAuth, uploadProfilePic.single("profile_picture"), updateMemberProfile);
router.post("/member-password-update", requireAuth, updatePassword);

// member dashboard/portals

router.get("/portal", viewMemberPortal);
router.get("/activities", requireAuth, viewMemberActivities);
router.get("/edit-profile", requireAuth, viewEditProfile);
router.get("/billing", requireAuth, viewMemberBlling);
router.get("/reports", requireAuth, viewMemberReports);

// get attendace stats
router.get("/stats", requireAuth, getMyStats);


router.get("/billing/invoices/:id", requireAuth, memberInvoice);
router.post("/billing/pay/:id", requireAuth, billingCsrf, requireFeature('online_payments'), startCheckout);
router.post('/billing/purchase',requireAuth,billingCsrf,async(req,res,next)=>{try{const result=await purchaseMembership(req.gymId,Number(req.user.sub),req.body.plan_id);if(req.is('application/json'))return res.status(201).json(result);res.redirect(303,`/member/billing#invoice-${result.invoice_id}`);}catch(error){if(error.status)return res.status(error.status).send(error.message);next(error);}});
router.post("/billing/requests", requireAuth, billingCsrf, requestChange);
router.post("/billing/payments/:reference/verify", requireAuth, billingCsrf, verifyPayment);
router.get("/billing/return", requireAuth, returnFromPaystack);
export default router;
