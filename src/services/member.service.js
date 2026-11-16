import { db } from "../config/db.js";
import { profilePhotoUrl } from './profilePhoto.service.js';

export async function getMemberWithProfile(userId, gymId) {
 const { rows } = await db.query(
  `
  SELECT
    u.id, u.firstname, u.lastname, u.email, u.phone, u.tier, u.joindate, u.role, u.status,

    mp.profile_picture, 
    mp.display_name, 
    mp.bio, 
    mp.mail_note, 
    mp.sms_note, 
    mp.wa_note, 
    mp.updated_at AS mp_updated_at,

    mcd.whatsapp_number, 
    mcd.alt_phone, 
    mcd.street_address, 
    mcd.city, 
    mcd.province, 
    mcd.postal_code, 
    mcd.notes,
    mcd.birthdate,
    mcd.gender,
    
    mec.ecname, 
    mec.relationship, 
    mec.phone, 
    mec.priority, 
    mec.ems_notes, 
    mec.updated_at AS ems_updated_at, 

    mhr.medical_conditions, 
    mhr.injuries, 
    mhr.health_notes, 
    mhr.consent_share_trainer, 
    mhr.medication, 
    mhr.updated_at AS health_updated_at

  FROM public.users u
  
  LEFT JOIN public.member_profile mp
    ON mp.user_id = u.id
   AND mp.gym_id = u.gym_id

  LEFT JOIN public.member_contact_details mcd
    ON mcd.user_id = u.id
   AND mcd.gym_id = u.gym_id

  LEFT JOIN public.member_emergency_contacts mec
    ON mec.user_id = u.id 
   AND mec.gym_id = u.gym_id

  LEFT JOIN public.member_health_records mhr
    ON mhr.user_id = u.id 
   AND mhr.gym_id = u.gym_id
      
  WHERE u.id = $1
    AND u.gym_id = $2
  LIMIT 1
  `,
  [userId, gymId]
);
  if (rows[0]) rows[0].profile_picture = profilePhotoUrl(rows[0].profile_picture, rows[0].id);
  return rows[0];
}


// search member for kiosk check-in service

export const searchMembers = async (query, gymId) => {
 const result = await db.query(
  `
  SELECT 
    u.id,
    u.firstname,
    u.lastname,
    mp.display_name,
    mp.profile_picture
  FROM users u
  LEFT JOIN member_profile mp 
    ON mp.user_id = u.id
   AND mp.gym_id = u.gym_id
  WHERE 
    u.gym_id = $2
    AND (
      u.firstname ILIKE $1
      OR u.lastname ILIKE $1
      OR (u.firstname || ' ' || u.lastname) ILIKE $1
      OR COALESCE(mp.display_name, '') ILIKE $1
    )
  ORDER BY u.firstname ASC
  LIMIT 6
  `,
  [`%${query}%`, gymId]
);

  return result.rows.map(member => ({ ...member, profile_picture: profilePhotoUrl(member.profile_picture, member.id) }));
};
