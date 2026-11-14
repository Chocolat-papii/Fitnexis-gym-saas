import {db} from '../../config/db.js';
import bcrypt from 'bcrypt';
import {audit,actorFrom} from '../../services/audit.service.js';
import {enforceLimit} from '../../services/saasBilling.service.js';
import {hasPermission} from '../../security/roles.js';
import * as management from '../../services/memberManagement.service.js';
const fail=(res,error)=>{
  if(error.code==='23505')return res.status(409).json({message:'That email is already used in this gym.'});
  if(error.status)return res.status(error.status).json({message:error.message});
  console.error('Member operation failed:',error.code||error.name);return res.status(500).json({message:'Could not complete this member operation.'});
};
export const viewAllMembers=(req,res)=>res.render('admin/admin-dashboard',{activePage:'members',gym:req.gym});
export const getMembers=async(req,res)=>{try{res.set('Cache-Control','no-store');res.json(await management.memberDirectory(req.gymId,req.query));}catch(error){fail(res,error);}};
export const viewMemberDetails=async(req,res,next)=>{
  try{
    const canEdit=hasPermission('gym',req.user.role,'members.write'),canBilling=hasPermission('gym',req.user.role,'billing.write');
    const data=await management.managedMember(req.gymId,req.params.id,{billing:canBilling,privateDetails:canEdit});
    res.set('Cache-Control','no-store');res.render('admin/admin-member-details',{...data,activePage:'members',gym:req.gym,canEdit,canBilling});
  }catch(error){if(error.status)return res.status(error.status).send(error.message);next(error);}
};
const action=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(error){fail(res,error);}};
export const saveMember=action(req=>management.saveManagedMember(req.gymId,req.params.id,actorFrom(req),req.body));
export const memberAccount=action(req=>management.setMemberAccount(req.gymId,req.params.id,actorFrom(req),req.body.action));
export const memberPassword=action(req=>management.resetManagedPassword(req.gymId,req.params.id,actorFrom(req),req.body.password));
export const memberPlan=action(req=>management.changeManagedPlan(req.gymId,req.params.id,actorFrom(req),req.body));

export const createMember = async (req, res) => {
  const client=await db.connect();
  try {
    const { firstname, lastname, email, phone, tier, joindate,
            gender, birthdate, notes,
            ecname, relationship, ephone

     } = req.body;
     const gymId = req.gymId;

    if (!firstname || !lastname || !email || !phone) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const allowed = ["Bronze", "Gold", "Platinum"];
    const safeTier = allowed.includes(tier) ? tier : "Bronze";
    const password = req.body.password;
    if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)return res.status(400).json({message:'Provide an initial password of at least 12 characters (maximum 72 bytes).'});

    const hashedPassword = await bcrypt.hash(password, 10);


     await client.query("BEGIN");
     await client.query('SELECT id FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);
     await enforceLimit(client,gymId,'members');

    const result = await client.query(
      `INSERT INTO public.users 
      (firstname, lastname, email, phone, password, tier, joindate, gym_id)
       VALUES 
       ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE),$8)
       RETURNING id, firstname, lastname, email, phone, tier,
        to_char(joindate, 'YYYY-MM-DD') AS joindate
        `,
      [firstname.trim(), lastname.trim(), email.trim().toLowerCase(), phone.trim(), hashedPassword, safeTier, joindate||null, gymId]
      );

      const userId = result.rows[0].id;

       // Insert contact details
        await client.query(
          `INSERT INTO public.member_contact_details
          (user_id, gender, birthdate, notes, gym_id)
          VALUES ($1,$2,$3,$4,$5)`,
          [userId, gender||null, birthdate||null, notes||null, gymId]
        );

        // Insert emergency contact
        await client.query(
          `INSERT INTO public.member_emergency_contacts
          (user_id, ecname, relationship, phone, gym_id)
          VALUES ($1,$2,$3,$4,$5)`,
          [userId, ecname, relationship, ephone, gymId]
        );

         await audit(client,{scope:'gym',id:Number(req.user.sub)},'member.created',gymId,String(userId));
         await client.query("COMMIT");

        return res.status(201).json({
          ok: true,
          message: "New member created successfully",
          data: result.rows[0]
        });
    
  }catch (err) {
    await client.query("ROLLBACK"); // 🔥 REQUIRED
  console.error("CREATE MEMBER ERROR:", err.code, err.message);
  return res.status(err.status||500).json({message:err.status?err.message:'Could not create member.'});
} finally { client.release(); }

};


export const deleteMember = action(req=>management.setMemberAccount(req.gymId,req.params.id,actorFrom(req),'deactivate'));

export const updateMemberTier = async (req, res) => {
  try {
    const { id } = req.params;
    const { tier } = req.body;
    const gymId = req.gymId;

    const allowed = ["Bronze", "Gold", "Platinum"];
    if (!allowed.includes(tier)) {
      return res.status(400).json({ message: "Invalid tier" });
    }

    const result = await db.query(
      `UPDATE public.users 
      SET tier = $1 
      WHERE id = $2 
      AND gym_id = $3 
      RETURNING id, tier`,
      [tier, id, gymId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Member not found" });
    }

    return res.status(200).json({ message: "Tier updated", member: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to update tier" });
  }
};
