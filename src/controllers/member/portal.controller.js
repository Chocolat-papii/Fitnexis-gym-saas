import { getUpcomingSessions } from '../../services/classSessions.service.js';


export const viewMemberPortal = async (req, res, next) =>  { 
   try {
    
    const gymId = req.gymId;
    const sessions = await getUpcomingSessions(gymId);

    res.render("dashboard/member-portal", {
      activePage: "portal",
      sessions,
      gym: req.gym
    });


  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

