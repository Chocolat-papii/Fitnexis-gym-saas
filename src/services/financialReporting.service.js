import {db} from '../config/db.js';
export async function financialSummary(gymId=null) {
  const values=gymId?[gymId]:[],where=gymId?'WHERE p.gym_id=$1':'';
  const [{rows:[totals]},{rows:gyms},{rows:exceptions}]=await Promise.all([
    db.query(`SELECT COALESCE(SUM(ROUND(p.amount*100)) FILTER (WHERE p.status='succeeded'),0) AS gross_cents,
      COALESCE(SUM(p.commission_cents-p.commission_refunded_cents) FILTER (WHERE p.status='succeeded'),0) AS commission_cents,
      COALESCE(SUM(p.gateway_fee_cents) FILTER (WHERE p.status='succeeded'),0) AS gateway_fee_cents,
      COALESCE(SUM(p.refunded_cents),0) AS refunded_cents,
      COUNT(*) FILTER(WHERE p.status='failed') AS failed,
      COUNT(*) FILTER(WHERE p.status='pending') AS pending,
      COUNT(*) FILTER(WHERE p.status='succeeded' AND p.provider='paystack' AND p.gateway_fee_cents IS NULL) AS unknown_fees,
      COALESCE(SUM(ROUND(p.amount*100)) FILTER(WHERE p.status='succeeded' AND p.provider='paystack'),0) AS online_gross_cents,
      COALESCE(SUM(ROUND(p.amount*100)) FILTER(WHERE p.status='succeeded' AND p.paid_at>=date_trunc('day',NOW() AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'Africa/Johannesburg'),0) AS today_cents,
      COALESCE(SUM(ROUND(p.amount*100)) FILTER(WHERE p.status='succeeded' AND p.paid_at>=NOW()-INTERVAL '7 days'),0) AS week_cents,
      COALESCE(SUM(ROUND(p.amount*100)) FILTER(WHERE p.status='succeeded' AND p.paid_at>=date_trunc('month',NOW() AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'Africa/Johannesburg'),0) AS month_cents,
      COALESCE(SUM(ROUND(p.amount*100)-p.commission_cents-CASE WHEN p.fee_bearer='subaccount' THEN COALESCE(p.gateway_fee_cents,0) ELSE 0 END)
        FILTER(WHERE p.status='succeeded' AND p.provider='paystack' AND p.settlement_status='settled'),0) AS settled_cents,
      COALESCE(SUM(ROUND(p.amount*100)-p.commission_cents-p.refunded_cents+p.commission_refunded_cents-
        CASE WHEN p.fee_bearer='subaccount' THEN COALESCE(p.gateway_fee_cents,0) ELSE 0 END) FILTER(WHERE p.status='succeeded'),0) AS expected_net_cents
      FROM payments p ${where}`,values),
    db.query(`SELECT g.id,g.name,g.account_status,g.commission_bps,s.status AS subscription_status,sp.name AS plan_name,
      ps.onboarding_status,ps.payout_eligible,ps.paystack_subaccount,
      COALESCE(p.gross,0) AS gross_cents,COALESCE(p.commission,0) AS commission_cents,
      COALESCE(si.revenue,0) AS saas_cents FROM gyms g
      LEFT JOIN gym_subscriptions s ON s.gym_id=g.id LEFT JOIN saas_plans sp ON sp.id=s.plan_id
      LEFT JOIN gym_payment_settings ps ON ps.gym_id=g.id
      LEFT JOIN (SELECT gym_id,SUM(ROUND(amount*100)) AS gross,SUM(commission_cents-commission_refunded_cents) AS commission FROM payments WHERE status='succeeded' GROUP BY gym_id) p ON p.gym_id=g.id
      LEFT JOIN (SELECT gym_id,SUM(amount_cents) AS revenue FROM saas_invoices WHERE status='paid' GROUP BY gym_id) si ON si.gym_id=g.id
      ${gymId?'WHERE g.id=$1':''} ORDER BY g.created_at DESC LIMIT 200`,values),
    db.query(`SELECT p.id,p.gym_id,p.reference,p.amount,p.status,p.commission_cents,p.gateway_fee_cents,p.refunded_cents,p.dispute_status,p.settlement_status,p.settlement_id
      FROM payments p ${gymId?'WHERE p.gym_id=$1 AND':'WHERE'} (p.status IN ('pending','failed') OR p.dispute_status IS NOT NULL OR (p.provider='paystack' AND p.settlement_status<>'settled'))
      ORDER BY p.id DESC LIMIT 200`,values)
  ]);
  const {rows:[subscriptions]}=await db.query(`SELECT COUNT(*) FILTER(WHERE status='active') AS active,COUNT(*) FILTER(WHERE status='overdue') AS overdue,COUNT(*) FILTER(WHERE status='cancelled') AS cancelled FROM gym_subscriptions ${gymId?'WHERE gym_id=$1':''}`,values);
  const {rows:[revenue]}=await db.query(`SELECT COALESCE(SUM(amount_cents),0) AS saas_cents FROM saas_invoices WHERE status='paid' ${gymId?'AND gym_id=$1':''}`,values);
  const {rows:planRevenue}=await db.query(`SELECT p.id,p.name,COALESCE(SUM(i.amount_cents),0) AS revenue_cents FROM saas_plans p
    LEFT JOIN saas_invoices i ON i.plan_id=p.id AND i.status='paid' ${gymId?'AND i.gym_id=$1':''} GROUP BY p.id,p.name ORDER BY p.id`,values);
  return {totals:{...totals,...revenue},gyms,exceptions,subscriptions:subscriptions||{},planRevenue};
}
export function financialCsv(rows) {
  const esc=v=>{const s=String(v??'');return '"'+(/^[\s]*[=+@-]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';};
  const keys=['name','account_status','subscription_status','plan_name','gross_cents','commission_cents','saas_cents','onboarding_status'];
  return [keys,...rows.map(row=>keys.map(k=>row[k]))].map(row=>row.map(esc).join(',')).join('\r\n');
}
