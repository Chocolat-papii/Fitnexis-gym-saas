import { dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import { db } from "../../config/db.js";


const __dirname = dirname(fileURLToPath(import.meta.url));

export const viewEditProfile = async (req, res, next) =>  { 
    return res.render("dashboard/member-edit-profile" , { 
      activePage: "edit-profile"
   });
};

// general member Account/ profile updates

export const updateMemberProfile = async (req, res) => {
  try {
    const userId = req.user.sub;
    const gymId = req.gymId;

    const display_name = req.body.display_name || null;
    const bio = req.body.bio || null;

    // checkboxes (FormData sends "on" or missing)
    const mail_note = req.body.mail_note === "on";
    const sms_note  = req.body.sms_note === "on";
    const wa_note   = req.body.wa_note === "on";

    // if file uploaded, save the public path
    const profile_picture = req.file
  ? `/uploads/profile-pics/${req.file.filename}`
  : null;

    await db.query(
      `
      INSERT INTO public.member_profile (user_id, profile_picture, display_name, bio, mail_note, sms_note, wa_note, gym_id)
      VALUES ($1, COALESCE($2, '/images/profile-pic.jpg'), $3, $4, $5, $6, $7,$8)
      ON CONFLICT (user_id, gym_id)
      DO UPDATE SET
        profile_picture = COALESCE($2, public.member_profile.profile_picture),
        display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio,
        mail_note = EXCLUDED.mail_note,
        sms_note  = EXCLUDED.sms_note,
        wa_note   = EXCLUDED.wa_note,
        updated_at = NOW()
      `,
      [userId, profile_picture, display_name, bio, mail_note, sms_note, wa_note, gymId]
    );

    return res.status(200).json({ ok: true, message: "Profile updated" });
  } catch (err) {
    console.error("PROFILE UPDATE ERROR:", err);          // full error
    console.error("CODE:", err.code, "MSG:", err.message); // pg errors have code/message
    return res.status(500).send("Server error updating profile");
  }
};


// password updates/change

export const updatePassword = async (req, res) => {
  try {
    const userId = req.user.sub;
    const gymId = req.gymId;

    if (!userId) return res.status(401).json({ ok: false, message: "Unauthorized" });

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ ok: false, message: "All fields are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ ok: false, message: "New password must be at least 8 characters" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ ok: false, message: "Passwords do not match" });
    }

    // Get current hash
    const { rows } = await db.query(
      `SELECT password FROM public.users 
      WHERE id = $1 
      AND gym_id = $2
      LIMIT 1`,
      [userId, gymId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "User not found",
      });
    }

    const user = rows[0];

    if (!user?.password) {
      return res.status(400).json({ ok: false, message: "Account has no password set yet" });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ ok: false, message: "Current password is incorrect" });
    }

    // Hash and update
    const hash = await bcrypt.hash(newPassword, 10);

    await db.query(
      `UPDATE public.users SET password = $1 WHERE id = $2 AND gym_id = $3`,
      [hash, userId, gymId]
    );

    return res.status(200).json({ ok: true, message: "Password updated" });
  } catch (err) {
    console.error("UPDATE PASSWORD ERROR:", err);
    return res.status(500).json({ ok: false, message: "Could not update password" });
  }
};
