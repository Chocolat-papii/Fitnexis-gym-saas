import { Router } from "express";
import { getMembers, deleteMember, updateMemberTier, createMember, viewMemberDetails, viewAllMembers } from "../controllers/admin/members.controller.js";
import { getClassActivities } from "../controllers/admin/classActivities.controller.js";
import { getAllClassTypes, createClassType, updateClassType, deleteClassType } from "../controllers/admin/classActivities.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createClassSession, deleteSession, editSession } from "../controllers/admin/classSession.controller.js";
import { viewAdminInsights } from "../controllers/admin/insights.controller.js";
import { searchMembersController, viewKiosk } from "../controllers/admin/searchMember.controller.js";
import { createCheckin } from "../controllers/admin/attendance.controller.js";
import { requireGym } from "../middleware/gym.middleware.js";
import { hydrateMember } from "../middleware/hydrateMember.js";



const router = Router();


router.use("/admin", requireGym, requireAuth, requireAdmin, hydrateMember);

// - - - admin dashboard - - - // 

//// ADMIN PAGES
router.get("/class-activities", getClassActivities);
router.get("/all-members", viewAllMembers);
router.get("/member-details/:id", viewMemberDetails);

//// class types APIs
router.get("/api/class-types", getAllClassTypes);
router.post("/api/class-types", createClassType);
router.put("/api/class-types/:id", updateClassType);
router.delete("/api/class-types/:id", deleteClassType);

// class sessions APIs
router.post("/api/class-sessions", createClassSession);
router.delete("/api/class-sessions/:id", deleteSession)
router.put("/api/class-sessions/:id", editSession)


// member APIs
router.get("/api/members", getMembers);
router.post("/api/members", createMember);
router.delete("/api/members/:id", deleteMember);
router.patch("/api/members/:id/tier", updateMemberTier);

// Member insights
router.get("/insights", viewAdminInsights);

// 🔍 Search members (kiosk)
router.get("/search-members", searchMembersController);

// ✅ Check-in (reuse existing controller)
router.post("/checkin", createCheckin);

// 🖥️ Kiosk page
router.get("/admin-kiosk", viewKiosk);


export default router;
