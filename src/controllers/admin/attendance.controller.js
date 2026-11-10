import { checkInMember, checkedInToday } from "../../services/attendance.service.js";

export const createCheckin = async (req, res) => {
  try {
    const { user_id } = req.body;
    const admin_id = req.user.sub;
    const gymId = req.gymId; // ✅ from middleware

    if (!user_id) {
      return res.status(400).json({
        error: "user_id required"
      });
    }

    const result = await checkInMember(user_id, admin_id, gymId);

    if (checked === null) {
        return res.status(404).json({
          error: "Member not found in this gym"
        });
    }

    if (result.memberNotFound) {
      return res.status(404).json({
        ok: false,
        message: "Member not found in this gym"
      });
    }

    if (result.alreadyChecked) {
      return res.json({
        ok: false,
        message: "Member already checked in today"
      });
    }

    res.json({
      ok: true,
      message: "Member checked in"
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Check-in failed"
    });
  }
};

export const getCheckinStatus = async (req, res) => {
  try {
    const { user_id } = req.params;
    const gymId = req.gymId;

    const checked = await checkedInToday(user_id, gymId);

    res.json({
      checked_in_today: checked
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to check attendance"
    });
  }
};