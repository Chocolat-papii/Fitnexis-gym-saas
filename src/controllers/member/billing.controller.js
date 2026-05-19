import { dirname } from "path";
import { fileURLToPath } from "url";
import path from "path";
import { db } from "../../config/db.js";


const __dirname = dirname(fileURLToPath(import.meta.url));

export const viewMemberBlling = async (req, res, next) => {

try {
    const userId = req.user.sub; // because I used { sub: user.id } in JWT
    const gymId = req.gymId;

    const { rows } = await db.query(
      `SELECT id, firstname, lastname, email, phone, tier, joindate, role, gym_id
       FROM public.users
       WHERE id = $1
       AND gym_id = $2

       LIMIT 1`,
      [userId, gymId]
    );

    const member = rows[0];
    if (!member) return res.redirect("/login");


   return res.render("dashboard/member-billing", {
    member,
    activePage: "billing",
    gym: req.gym
  });
} catch (err) {
    console.error("PORTAL ERROR:", err);
    return res.status(500).send("Server error");
  }

};