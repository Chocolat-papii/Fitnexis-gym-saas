import bcrypt from "bcrypt";
import { db } from "../../config/db.js";
import { beginMfa } from '../../services/mfa.service.js';
import { mfaCookieName, gymCookieOptions } from '../../services/authSessions.service.js';
import {audit} from '../../services/audit.service.js';


export const loginForm = (req, res) => {

  return res.render("landing/partials/login-form", {
    gym: req.gym
  });
};


// working
export const loginMember = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email!=='string'||typeof password!=='string'||!email||!password||email.length>255||Buffer.byteLength(password)>72) return res.status(400).json({ message: "Email and password required" });

    const result = await db.query(
      `SELECT id, firstname, lastname, email, role, password, gym_id, auth_version, mfa_secret
       FROM public.users
       WHERE email = $1
       AND gym_id = $2
       AND is_active = true
     
       LIMIT 1`,
      [email, req.gymId]
    );


    // ✅ Check if user exists
    const user = result.rows[0];
    if (!user) return res.status(401).json({
      success: false,
      message: "Invalid credentials" });

    
    if (!user.password) {
      return res.status(403).json({ 
        success: false,
        message: "Account not activated. Please set a password first." });
    }

    // ✅ Check password
    const ok = await bcrypt.compare(
      password, 
      user.password);

    if (!ok) {await audit(db,{scope:'gym',id:user.id},'security.login_failed',req.gymId);return res.status(401).json({
      success: false,
      message: "Invalid credentials" 
    });}

    {
      const challenge = await beginMfa('gym', user);
      res.cookie(mfaCookieName('gym'), challenge, {...gymCookieOptions, sameSite:'strict', maxAge:300000});
      return res.json({success:true, redirect:'/security/mfa/gym', message:'Check your email for a verification code.', duration:0});
    }

    
  } catch (err) {
    console.error("Sign-in failed:", err.code || err.name);
    if(err.status)return res.status(err.status).json({success:false,message:err.message});
    return res.status(500).json({ 
     success: false,
     message: "Something went wrong!"
    });
  }
};
