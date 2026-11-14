import { db } from '../config/db.js';

export async function platformOverview(search = '', page = 1) {
  const [summary, gyms, growth, activity] = await Promise.all([
    db.query(`SELECT (SELECT COUNT(*) FROM gyms) AS gyms,
      (SELECT COUNT(*) FROM gyms WHERE name ILIKE $1 OR slug ILIKE $1 OR email ILIKE $1) AS matching_gyms,
      (SELECT COUNT(*) FROM users WHERE role='member') AS members,
      (SELECT COUNT(*) FROM users WHERE role='member' AND status='active') AS active_members,
      (SELECT COUNT(*) FROM attendance WHERE check_in_time >= NOW() - INTERVAL '30 days') AS checkins,
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='succeeded' AND currency='ZAR'
        AND paid_at >= NOW() - INTERVAL '30 days') AS collected`, [`%${search}%`]),
    db.query(`SELECT g.id,g.name,g.slug,g.email,g.created_at,
      COALESCE(u.members,0) AS members, COALESCE(u.active_members,0) AS active_members,
      COALESCE(a.checkins,0) AS checkins, COALESCE(p.collected,0) AS collected
      FROM gyms g
      LEFT JOIN (SELECT gym_id,COUNT(*) FILTER (WHERE role='member') AS members,
        COUNT(*) FILTER (WHERE role='member' AND status='active') AS active_members
        FROM users GROUP BY gym_id) u ON u.gym_id=g.id
      LEFT JOIN (SELECT gym_id,COUNT(*) AS checkins FROM attendance
        WHERE check_in_time >= NOW() - INTERVAL '30 days' GROUP BY gym_id) a ON a.gym_id=g.id
      LEFT JOIN (SELECT gym_id,SUM(amount) AS collected FROM payments
        WHERE status='succeeded' AND currency='ZAR' AND paid_at >= NOW() - INTERVAL '30 days'
        GROUP BY gym_id) p ON p.gym_id=g.id
      WHERE g.name ILIKE $1 OR g.slug ILIKE $1 OR g.email ILIKE $1
      ORDER BY g.created_at DESC,g.id LIMIT 25 OFFSET $2`, [`%${search}%`, (page - 1) * 25]),
    db.query(`SELECT TO_CHAR(m.month,'Mon YYYY') AS month,
      (SELECT COUNT(*) FROM gyms WHERE created_at >= m.month AND created_at < m.month + INTERVAL '1 month') AS gyms,
      (SELECT COUNT(*) FROM users WHERE role='member' AND created_at >= m.month
        AND created_at < m.month + INTERVAL '1 month') AS members
      FROM generate_series(date_trunc('month',NOW() AT TIME ZONE 'Africa/Johannesburg') - INTERVAL '5 months',
        date_trunc('month',NOW() AT TIME ZONE 'Africa/Johannesburg'), INTERVAL '1 month') m(month) ORDER BY m.month`),
    db.query(`SELECT a.name,s.created_at,s.expires_at,s.logged_out_at FROM platform_sessions s
      JOIN platform_admins a ON a.id=s.admin_id ORDER BY s.created_at DESC LIMIT 10`)
  ]);
  return { summary: summary.rows[0], gyms: gyms.rows, growth: growth.rows, activity: activity.rows,
    total: Number(summary.rows[0].matching_gyms), search, page };
}
