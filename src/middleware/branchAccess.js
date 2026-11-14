import {db} from '../config/db.js';
export async function branchAccess(req,res,next) {
  try{
    if(!req.path.startsWith('/api/class-sessions'))return next();
    let branch=req.body?.branch_id;
    if(req.params?.id||/^\/api\/class-sessions\/\d+$/.test(req.path)){
      const id=req.params?.id||req.path.split('/').at(-1);
      const {rows:[session]}=await db.query('SELECT branch_id FROM class_sessions WHERE id=$1 AND gym_id=$2',[id,req.gymId]);
      if(session?.branch_id){await checkBranch(req,session.branch_id);if(branch==null)branch=session.branch_id;}
    }
    if(branch!=null&&branch!=='')await checkBranch(req,branch);
    next();
  }catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error);}
}
async function checkBranch(req,id) {
  if(!Number.isSafeInteger(Number(id))||Number(id)<1)throw Object.assign(new Error('Invalid branch.'),{status:400});
  const {rows:[branch]}=await db.query(`SELECT b.id FROM gym_branches b WHERE b.id=$1 AND b.gym_id=$2 AND
    ($3::boolean OR EXISTS(SELECT 1 FROM staff_branch_access a WHERE a.branch_id=b.id AND a.gym_id=b.gym_id AND a.user_id=$4))`,[id,req.gymId,req.user.role==='gym_super_admin',req.user.sub]);
  if(!branch)throw Object.assign(new Error('You do not have access to this gym branch.'),{status:403});
}
