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
        const newClass = await classTypesService.createClassType({
            ...req.body, 
            gym_id: gymId});

        res.status(201).json(newClass, {
            message: "Class created successfully.",
        });
    } catch (error) {
        console.error("CREATE CLASS ERROR:", error);
        // Unique constraint violation
        if (error.code === "23505") {
            return res.status(409).json({
                message: `${req.body.name} already exists.`
            });
        }
        res.status(500).json({ message: "Failed to create class type" });
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
