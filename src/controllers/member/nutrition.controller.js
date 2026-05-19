import { dirname } from "path";
import { fileURLToPath } from "url";
import * as dietaryService from '../../services/memberDietary.service.js';


const __dirname = dirname(fileURLToPath(import.meta.url));

export const viewMemberNutrition = async (req, res, next) => {
return res.render("dashboard/member-nutrition", {
    activePage: "nutrition",
    gym: req.gym
  });
}

// - - - Dietary information controller - - - //

export async function getMemberDietary(req, res) {
  try {
    const userId = req.user.sub;
    const gymId = req.gymId;

    const dietary = await dietaryService.getDietaryInfo(userId, gymId);
    res.json({ success: true, dietary });
  } catch (err) {
    console.error('Dietary info error:', err);
    res.status(500).json({ success: false, message: 'Error fetching dietary info.' });
  }
}

export async function updateMemberDietary(req, res) {
  try {
    if (!req.user || !req.user.sub) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated."
      });
    }

    const userId = req.user.sub;
        const gymId = req.gymId;

    const dietary = await dietaryService.updateDietaryInfo(userId, req.body, gymId);

    res.json({
      success: true,
      message: "Dietary info saved successfully.",
      dietary
    });

  } catch (err) {
    console.error("Dietary update error:", err);
    res.status(500).json({
      success: false,
      message: "Server error."
    });
  }
}