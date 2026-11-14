export const GYM_ROLES = ['gym_super_admin','gym_admin','gym_manager','gym_receptionist','gym_trainer','member'];
export const PLATFORM_ROLES = ['fitnexis_super_admin','fitnexis_admin','fitnexis_support'];
export const canonicalRole = role => role === 'admin' ? 'gym_admin' : role;
const gym = {
  gym_super_admin: ['members.read','members.write','checkins.write','classes.read','classes.write','reports.read','billing.read','billing.write','payments.configure','staff.manage','gym.manage','subscription.manage','ownership.manage','support.authorize','audit.read'],
  gym_admin: ['members.read','members.write','checkins.write','classes.read','classes.write','reports.read','billing.read','billing.write'],
  gym_manager: ['members.read','members.write','checkins.write','classes.read','classes.write','reports.read','staff.read'],
  gym_receptionist: ['members.read','checkins.write','classes.read'],
  gym_trainer: ['classes.read'],
  member: []
};
const platform = {
  fitnexis_super_admin: ['gyms.read','gyms.manage','billing.read','billing.manage','commission.manage','admins.manage','audit.read','support.read','enquiries.manage'],
  fitnexis_admin: ['gyms.read','gyms.manage','billing.read','audit.read','support.read','enquiries.manage'],
  fitnexis_support: ['gyms.read','support.read','enquiries.manage']
};
export function hasPermission(scope, role, permission) {
  return (scope === 'platform' ? platform[role] : gym[canonicalRole(role)])?.includes(permission) || false;
}
export function requirePermission(scope, permission) {
  return (req,res,next) => hasPermission(scope, (scope === 'platform' ? req.platformAdmin : req.user)?.role, permission)
    ? next() : res.status(403).json({error:'permission_denied',message:'You do not have permission for this operation.'});
}
export const requiresGymMfa = role => canonicalRole(role) === 'gym_super_admin';
export function gymHomeForRole(role) {
  return ({member:'/member/portal',gym_receptionist:'/admin/admin-kiosk',gym_trainer:'/admin/training'})[canonicalRole(role)]||'/admin/all-members';
}
