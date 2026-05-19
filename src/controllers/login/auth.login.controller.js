import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../../config/db.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const signToken = (user) =>
  jwt.sign(
    { 
      sub: user.id, 
      role: user.role, 
      email: user.email,
      gymId: user.gym_id
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || "2h" 
    });

    

    // working
export const loginForm = (req, res) => {

  return res.render("landing/partials/login-form", {
    gym: req.gym
  });
};


// working
export const loginMember = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const result = await db.query(
      `SELECT id, firstname, lastname, email, role, password, gym_id
       FROM public.users
       WHERE email = $1
       AND gym_id = $2
     
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

    if (!ok) return res.status(401).json({ 
      success: false,
      message: "Invalid credentials" 
    });

    const token = signToken(user);

    // store token (so future requests know who you are)
   res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // safer for local dev
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    

    // go to the portal route (not a direct file send)
    return res.status(200).json({
      success: true,
      message: "Login successful. redirecting . . .",
      redirect: user.role === "admin" 
          ? "/admin/all-members" 
          : "/member/portal",
      duration: 3000
    });
    
  } catch (err) {
    console.log("err msg:", err);
    return res.status(500).json({ 
     success: false,
     message: "Something went wrong!"
    });
  }
};
