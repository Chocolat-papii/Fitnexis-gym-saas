import {
  getSummaryStats,
  getGoalStats,
  getAttendanceTrend,
  getInactiveUsers,
  getActiveUsers,
  getAtRiskUsers,
  getAvgVisits,
  getTodayCheckIns,
  getTodayCheckInsCount,
  getInactiveUsersCount
} from "../../services/insights.service.js";

export const viewAdminInsights = async (req, res, next) => {
  try {
    const gymId = req.gymId; // ✅ correct

    const checkinsPage = parseInt(req.query.checkinsPage) || 1;
    const inactivePage = parseInt(req.query.inactivePage) || 1;

    const limit = 5;

    const checkinsOffset = (checkinsPage - 1) * limit;
    const inactiveOffset = (inactivePage - 1) * limit;


   const [
  summary,
  goals,
  trend,
  activeMembers,
  atRiskMembers,
  avgVisits,
  checkedIns,
  totalCheckIns,
  inactiveUsers,
  totalInactiveUsers,
] = await Promise.all([
  getSummaryStats(gymId),
  getGoalStats(gymId),
  getAttendanceTrend(gymId),
  getActiveUsers(gymId),                
  getAtRiskUsers(gymId),
  getAvgVisits(gymId),
   getTodayCheckIns(gymId, limit, checkinsOffset),
  getTodayCheckInsCount(gymId),
  getInactiveUsers(gymId, limit, inactiveOffset),
  getInactiveUsersCount(gymId)
]);



    const totalCheckinPages = Math.ceil(totalCheckIns / limit);
    const totalInactivePages = Math.ceil(totalInactiveUsers / limit);


    const engagementRate = summary.total_members > 0 ? ((activeMembers / summary.total_members) * 100).toFixed(1) : 0;

    res.render("admin/admin-insights", {
      activePage: "insights",
      summary,
      goals,
      trend,
      inactiveUsers,
      activeMembers,
      engagementRate,
      atRiskMembers, 
      avgVisits,
      checkedIns,
      // 👇 separate pagination
      checkinsPage,
      totalCheckinPages,
      inactivePage,
      totalInactivePages,
      gym: req.gym
    });


  } catch (err) {
    next(err);
  }
};