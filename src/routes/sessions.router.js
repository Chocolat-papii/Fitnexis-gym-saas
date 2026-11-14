// routes/sessions.routes.js
import express from "express";
import { getSessions } from "../controllers/classSession.controller.js";
import { requireAuth } from '../middleware/requireAuth.js';
import { requireGym } from "../middleware/gym.middleware.js";
import {listSessionHistory,sessionHistoryDetail} from '../services/sessionHistory.service.js';

const router = express.Router();
const history=fn=>async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try{res.json(await fn(req));}catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error);}
};
router.get('/history',requireGym,requireAuth,history(req=>listSessionHistory(req.gymId,req.user,req.query.page??1)));
router.get('/history/:id',requireGym,requireAuth,history(req=>sessionHistoryDetail(req.gymId,req.user,req.params.id)));

router.get("/", requireGym, (req, res, next) => req.cookies?.token ? requireAuth(req, res, next) : next(), getSessions);

export default router;
