import {db} from '../config/db.js';
import {hasPermission} from '../security/roles.js';
import {billingError,positiveId} from './billing.service.js';

const past="(COALESCE(s.ends_at,s.starts_at)<=NOW() OR s.status IN ('completed','cancelled'))";
const branch=`($3::int IS NULL OR s.branch_id IS NULL OR EXISTS(SELECT 1 FROM staff_branch_access a WHERE a.user_id=$3 AND a.branch_id=s.branch_id AND a.gym_id=s.gym_id))`;
const staffId=user=>hasPermission('gym',user.role,'classes.read')&&user.role!=='gym_super_admin'?Number(user.sub):null;

export async function listSessionHistory(gymId,user,page=1) {
  const pageNumber=Number(page);
  if(!Number.isSafeInteger(pageNumber)||pageNumber<1||pageNumber>100000)throw billingError('Invalid history page');
  const staff=hasPermission('gym',user.role,'classes.read');
  const {rows}=await db.query(`SELECT s.id,s.starts_at,s.ends_at,s.status,s.is_paid,s.price,c.name AS class_name,c.description
    FROM class_sessions s JOIN class_types c ON c.id=s.class_type_id AND c.gym_id=s.gym_id
    WHERE s.gym_id=$1 AND ${past} AND ${branch}
    AND ($4::boolean OR EXISTS(SELECT 1 FROM class_bookings mine WHERE mine.session_id=s.id AND mine.gym_id=s.gym_id AND mine.user_id=$5))
    ORDER BY s.starts_at DESC,s.id DESC LIMIT 21 OFFSET $2`,[gymId,(pageNumber-1)*20,staffId(user),staff,Number(user.sub)]);
  return {sessions:rows.slice(0,20),page:pageNumber,has_more:rows.length>20};
}

export async function sessionHistoryDetail(gymId,user,id) {
  const sessionId=positiveId(id),staff=hasPermission('gym',user.role,'classes.read');
  if(!sessionId)throw billingError('Invalid session',400);
  if(!staff){
    const {rows:[session]}=await db.query(`SELECT s.id,s.starts_at,s.ends_at,s.status,s.location,s.is_paid,s.price,
      c.name AS class_name,c.description,b.booking_status AS my_booking_status,b.booked_at
      FROM class_sessions s JOIN class_types c ON c.id=s.class_type_id AND c.gym_id=s.gym_id
      JOIN class_bookings b ON b.session_id=s.id AND b.gym_id=s.gym_id AND b.user_id=$2
      WHERE s.gym_id=$1 AND s.id=$3 AND ${past}`,[gymId,Number(user.sub),sessionId]);
    if(!session)throw billingError('Session history not found',404);
    return {session,can_view_signups:false};
  }
  const {rows:[session]}=await db.query(`SELECT s.id,s.starts_at,s.ends_at,s.status,s.capacity,s.location,s.is_paid,s.price,
    s.waitlist_enabled,s.cancellation_deadline_hours,s.created_at,s.updated_at,
    c.name AS class_name,c.description,
    NULLIF(TRIM(CONCAT(t.firstname,' ',t.lastname)),'') AS trainer_name,br.name AS branch_name,
    (SELECT COUNT(*)::int FROM class_bookings b WHERE b.session_id=s.id AND b.gym_id=s.gym_id) AS signup_count,
    (SELECT b.booking_status FROM class_bookings b WHERE b.session_id=s.id AND b.gym_id=s.gym_id AND b.user_id=$2) AS my_booking_status
    FROM class_sessions s JOIN class_types c ON c.id=s.class_type_id AND c.gym_id=s.gym_id
    LEFT JOIN users t ON t.id=s.trainer_id AND t.gym_id=s.gym_id
    LEFT JOIN gym_branches br ON br.id=s.branch_id AND br.gym_id=s.gym_id
    WHERE s.id=$4 AND s.gym_id=$1 AND ${past} AND ${branch}`,[gymId,Number(user.sub),staffId(user),sessionId]);
  if(!session)throw billingError('Session history not found',404);
  // Names and booking records are returned only to gym staff, within their branch scope.
  if(staff){
    const {rows}=await db.query(`SELECT b.id,u.firstname,u.lastname,b.booking_status,b.booked_at
      FROM class_bookings b JOIN users u ON u.id=b.user_id AND u.gym_id=b.gym_id
      WHERE b.session_id=$1 AND b.gym_id=$2 ORDER BY b.booked_at,b.id`,[sessionId,gymId]);
    session.signups=rows;
  }
  return {session,can_view_signups:staff};
}
