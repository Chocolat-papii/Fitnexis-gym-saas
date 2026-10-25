import * as classTypesService from "../../services/classTypes.service.js";
import * as sessionsService from "../../services/classSessions.service.js";


// - - actual page - - //

export const getClassActivities = async (req, res, next) => {

    const gymId = req.gymId;
    const classTypes = await classTypesService.getAll(gymId);
    const sessions = await sessionsService.getAllSessions(gymId);

    return res.render("admin/admin-class-activities", {
        activePage: "classes",
        classTypes,
        sessions,
        gym: req.gym

    });
};


// - - class type controllers - - //


export const getAllClassTypes = async (req, res) => {
    try {
        const gymId = req.gymId;
        const classTypes = await classTypesService.getAll(gymId);
        res.status(200).json(classTypes);
    } catch (error) {
        console.error("CREATE CLASS ERROR:", error);
        res.status(500).json({ message: "Failed to fetch class types" });
    }
};


export const createClassType = async (req, res) => {
  try {
    const gymId = req.gymId;

    if (!gymId) {
      return res.status(400).json({
        message: "Gym context is required"
      });
    }

    const newClass = await classTypesService.createClassType(
      req.body,
      gymId
    );

    return res.status(201).json({
      message: "Class created successfully.",
      data: newClass
    });
  } catch (error) {
    console.error("CREATE CLASS ERROR:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        message: `${req.body.name} already exists.`
      });
    }

    return res.status(500).json({
      message: "Failed to create class type"
    });
  }
};


export const updateClassType = async (req, res) => {
    try {
        const gymId = req.gymId;
        const updated = await classTypesService.updateClassType(
            req.params.id,
            req.body,
            gymId
        );
        res.status(200).json({
            success: true,
            message: "Class updated successfully.",
            data: updated
        });
    } catch (error) {
        console.error("CREATE CLASS ERROR:", error);
        res.status(500).json({ message: "Failed to update class type" });
    }
};

export const deleteClassType = async (req, res) => {
    try {
        const gymId = req.gymId;
        await classTypesService.deleteClassType(req.params.id, gymId);
        res.status(200).json({ message: "Class type deleted successfully." });
    } catch (error) {
        // console.error("CREATE CLASS ERROR:", error);
        res.status(500).json({ message: "Failed to delete class type" });
    }
};


// - - class sessions controllers - - //
