// src/middleware/requireAdmin.js
import jwt from "jsonwebtoken";
import {canonicalRole,GYM_ROLES,gymHomeForRole} from "../security/roles.js";

export const requireAdmin = (req, res, next) => {
  if (!req.user || !GYM_ROLES.includes(canonicalRole(req.user.role)) || req.user.role === "member") {
    return res.status(403).json({
      error: "admin_required",
      message: "You are not authorized to perform this action."
    });
  }

  next();
};

export const redirectLoggedIn = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.aud !== 'fitnexis-gym' || decoded.gymId !== req.gymId) return next();
    if (canonicalRole(decoded.role) !== 'member') return res.redirect(gymHomeForRole(decoded.role));
    return res.redirect("/member/portal");
  } catch {
    next();
  }
};
