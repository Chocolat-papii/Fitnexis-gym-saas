import { getMemberWithProfile } from "../services/member.service.js";
import * as dietaryService from "../services/memberDietary.service.js";
import * as physiqueService  from '../services/physiqueLifestyleService.js';
import {csrfToken} from './billingCsrf.js';
import {hasPermission} from '../security/roles.js';

export const hydrateMember = async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    const gymId = req.gymId;

    if (!userId) return res.redirect("/login");

    const member = await getMemberWithProfile(userId, gymId);
    if (!member) return res.redirect("/login");
    const dietary = await dietaryService.getDietaryInfo(req.user.sub, gymId);
    const physique = await physiqueService.getByMemberphysiqueInfo(req.user.sub, gymId);

    member.dietary = dietary; // ✅ attach dietary info
    member.physique = physique; // ✅ attach physique info



    res.locals.member = member;
    res.locals.csrf = csrfToken(req);
    res.locals.canGym = permission => hasPermission('gym', req.user.role, permission);
    return next();
  } catch (err) {
    console.error("HYDRATE MEMBER ERROR:", err);
    return res.redirect("/login");
  }
};
