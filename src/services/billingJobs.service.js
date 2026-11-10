import { db } from '../config/db.js';
import { runBillingCycle } from './billing.service.js';

let busy = false;
export async function runAllGymsBilling() {
  if (busy) return;
  busy = true;
  try {
    const { rows } = await db.query('SELECT id FROM gyms');
    for (const gym of rows) {
      try { await runBillingCycle(gym.id); }
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
