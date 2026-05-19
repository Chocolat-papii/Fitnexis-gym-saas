// controllers/admin/searchMembers.js
import { searchMembers } from "../../services/member.service.js";

export const viewKiosk = async (req, res) => {
    res.render("admin/admin-kiosk", {
        activePage: 'kiosk',
        gym: req.gym
        });
}

export const searchMembersController = async (req, res) => {
  try {
    const { q } = req.query;
    const gymId = req.gymId;

    if (!q) return res.json([]);

    const results = await searchMembers(q, gymId);

    res.json(results);

    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
};