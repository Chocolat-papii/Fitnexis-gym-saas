import * as classSessionsService from "../../services/classSessions.service.js";
import { db } from "../../config/db.js";

export const createClassSession = async (req, res) => {
  try {
    const gymId = req.gymId;
    const session = await classSessionsService.createClassSession(req.body, gymId);
    res.status(201).json({ success: true, message: "Session created", session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteSession = async (req, res) => {
  try {
    const { id } = req.params;
    const gymId = req.gymId;

    const deleted = await classSessionsService.deleteSession(id, gymId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Session not found"
      });
    }

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to delete session"
    });
  }
};

// - - edit session - - //

export const editSession = async (req, res) => {
  try {
    const { id } = req.params;
    const gymId = req.gymId;

    const session = await classSessionsService.updateSession(
      id,
      req.body,
      gymId
    );

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found"
      });
    }

    res.json({
      success: true,
      session
    });

  
  } catch (err) {
    console.error("UPDATE SESSION ERROR:", err);

    if (err.code === "CLASS_TYPE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Class type not found for this gym"
      });
    }

    if (err.code === "INVALID_SESSION_DATETIME") {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update session"
    });
  }
};

