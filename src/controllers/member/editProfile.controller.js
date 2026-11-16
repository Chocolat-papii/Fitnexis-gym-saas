import { dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import { db } from "../../config/db.js";
import { profilePhotoStorage, profilePhotoUrl } from '../../services/profilePhoto.service.js';
import { hasPermission } from '../../security/roles.js';


const __dirname = dirname(fileURLToPath(import.meta.url));

export const viewEditProfile = async (req, res, next) =>  { 
    return res.render("dashboard/member-edit-profile" , { 
      activePage: "edit-profile",
      gym: req.gym
   });
};

// general member Account/ profile updates

export const updateMemberProfile = async (req, res) => {
  const userId = req.user?.sub;
  const gymId = req.gymId;
  if (!userId || !gymId) return res.status(401).json({ ok: false, message: 'Please sign in again.' });
  let uploaded, previousPhoto, connection, committed = false;
  try {

    const display_name = req.body.display_name || null;
    const bio = req.body.bio || null;

    // checkboxes (FormData sends "on" or missing)
    const mail_note = req.body.mail_note === "on";
    const sms_note  = req.body.sms_note === "on";
    const wa_note   = req.body.wa_note === "on";

    if (req.file) {
      uploaded = await profilePhotoStorage.upload(req.file, gymId, userId);
      connection = await db.connect();
      await connection.query('BEGIN');
      // Serialize replacements, including the first profile insert.
      const owner = await connection.query('SELECT id FROM users WHERE id=$1 AND gym_id=$2 FOR UPDATE', [userId, gymId]);
      if (!owner.rows.length) throw Object.assign(new Error('Member not found.'), { status: 404 });
      const { rows } = await connection.query('SELECT profile_picture FROM member_profile WHERE user_id=$1 AND gym_id=$2', [userId, gymId]);
      previousPhoto = rows[0]?.profile_picture;
    }
    const profile_picture = uploaded || null;

    await (connection || db).query(
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

    if (connection) await connection.query('COMMIT');
    committed = true;
    if (previousPhoto?.startsWith('supabase://')) {
      try { await profilePhotoStorage.remove(previousPhoto, gymId, userId); }
      catch { console.error('Previous profile photo cleanup failed.'); }
    }
    return res.status(200).json({ ok: true, message: "Profile updated", ...(uploaded ? { profile_picture: profilePhotoUrl(uploaded, userId) } : {}) });
  } catch (err) {
    if (connection && !committed) {
      try { await connection.query('ROLLBACK'); } catch { /* Connection may have closed. */ }
    }
    if (uploaded && !committed) {
      try { await profilePhotoStorage.remove(uploaded, gymId, userId); }
      catch { console.error('Uncommitted profile photo cleanup failed.'); }
    }
    const status = [400, 403, 404, 503].includes(err.status) ? err.status : 500;
    return res.status(status).json({ ok: false, message: status === 500 ? 'Could not update profile. Please try again.' : err.message });
  } finally {
    connection?.release();
  }
};

export async function viewProfilePhoto(req, res) {
  res.set('Cache-Control', 'private, no-store');
  const userId = req.params.userId;
  if (!/^[1-9]\d*$/.test(userId)) return res.sendStatus(404);
  if (String(req.user?.sub) !== userId && !hasPermission('gym', req.user?.role, 'members.read')) return res.sendStatus(403);
  try {
    const { rows } = await db.query('SELECT profile_picture FROM member_profile WHERE user_id=$1 AND gym_id=$2', [userId, req.gymId]);
    const reference = rows[0]?.profile_picture;
    if (!reference?.startsWith('supabase://')) return res.redirect(302, '/images/profile-pic.jpg');
    const url = await profilePhotoStorage.signedUrl(reference, req.gymId, userId);
    res.set('Referrer-Policy', 'no-referrer');
    return res.redirect(302, url);
  } catch (error) {
    return res.status(error.status === 404 ? 404 : 503).send('Photo unavailable.');
  }
}


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
      `UPDATE public.users SET password = $1, auth_version=auth_version+1 WHERE id = $2 AND gym_id = $3`,
      [hash, userId, gymId]
    );

    return res.status(200).json({ ok: true, message: "Password updated" });
  } catch (err) {
    console.error("UPDATE PASSWORD ERROR:", err);
    return res.status(500).json({ ok: false, message: "Could not update password" });
  }
};
