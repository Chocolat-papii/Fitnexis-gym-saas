import { db } from '../config/db.js';
import { runBillingCycle } from './billing.service.js';
import {runSaasRenewals} from './saasBilling.service.js';
import {notify} from './audit.service.js';

let busy = false;
export async function runAllGymsBilling() {
  if (busy) return;
  busy = true;
  try {
    await runSaasRenewals();
    const { rows } = await db.query("SELECT id FROM gyms WHERE account_status='active'");
    for (const gym of rows) {
      try {
        await runBillingCycle(gym.id);
        const {rows:due}=await db.query(`SELECT id,user_id FROM invoices WHERE gym_id=$1 AND status='due' AND due_at<=NOW()+INTERVAL '7 days' ORDER BY id LIMIT 500`,[gym.id]);
        for(const invoice of due)await notify(db,{gymId:gym.id,userId:invoice.user_id,audience:'member',kind:'membership_renewal',key:`invoice-due:${invoice.id}`,message:'A membership or session invoice is due soon. Review Membership & Billing for details.'});
      }
      catch (error) { console.error(`Billing job failed for gym ${gym.id}`, error); }
    }
  } finally { busy = false; }
}

/** Enable this on exactly one worker process; set ENABLE_BILLING_JOBS=true. */
export function startBillingJobs() {
  if (process.env.ENABLE_BILLING_JOBS !== 'true') return;
  const interval = setInterval(() => void runAllGymsBilling().catch(console.error), 30 * 60 * 1000);
  interval.unref();
  void runAllGymsBilling().catch(console.error);
}
