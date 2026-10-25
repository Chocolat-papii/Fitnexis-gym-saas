import { db } from "../config/db.js";

// Helper to calculate end_at from start_at and duration
function calcEndAt(startAt, durationMinutes) {
  return new Date(new Date(startAt).getTime() + durationMinutes * 60000); // ms
}

export const createClassSession = async (data, gymId) => {
  try {
    // get class_type info
    const classType = await db.query(
      `SELECT id, default_duration_minutes, description, gym_id 
      FROM class_types 
      WHERE id = $1 
      AND gym_id = $2
      LIMIT 1`,
      [data.class_type_id, gymId]
    );

    if (!classType.rows[0]) {
      const error = new Error("Class type not found for this gym");
      error.code = "CLASS_TYPE_NOT_FOUND";
      throw error;
    }

    const startAt = new Date(`${data.date} ${data.time}`);
    const endAt = calcEndAt(startAt, classType.rows[0].default_duration_minutes);

    const query = `
      INSERT INTO class_sessions
        (
        class_type_id,
        trainer_id,
        start_time,
        starts_at,
        ends_at,
        capacity,
        location,
        status,
        created_at,
        updated_at,
        waitlist_enabled,
        cancellation_deadline_hours,
        gym_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),$9,$10,$11)
      RETURNING *
    `;

    const values = [
      classType.rows[0].id,          
      data.trainer_id || null,       
      data.time,                      
      startAt,                        
      endAt,                          
      data.capacity,                 
      data.location,                 
      data.status || "scheduled",     
      data.waitlist_enabled || false,
      data.cancellation_deadline_hours || 24,
      gymId 
    ];

    const result = await db.query(query, values);

    return result.rows[0];
    
  } catch (err) {
    console.error("CREATE SESSION ERROR:", err);
    throw err;

    if (err.code === "CLASS_TYPE_NOT_FOUND") {
    return res.status(404).json({
      success: false,
      message: "Class type not found for this gym"
    });
  }

  return res.status(500).json({
    success: false,
    message: "Failed to create session"
  });
  }
};

export const getAllSessions = async (gymId) => {
  const query = `
    SELECT
      s.id,
      s.starts_at,
      s.ends_at,
      s.capacity,
      s.location,
      s.status,
      s.trainer_id,
      s.gym_id,
      c.name AS class_name,
      c.description,
      c.default_duration_minutes,
      c.gym_id
    FROM class_sessions s
    JOIN class_types c 
    ON c.id = s.class_type_id
    AND c.gym_id = s.gym_id
    WHERE s.gym_id = $1
    ORDER BY s.starts_at ASC
  `;

  const result = await db.query(query, [gymId]);

  return result.rows;
};

export const getUpcomingSessions = async (gymId) => {
  const query = `
    SELECT
      s.id,
      s.starts_at,
      s.ends_at,
      s.capacity,
      s.location,
      s.status,
      s.trainer_id,
      s.gym_id,
      
      c.name AS class_name,
      c.description,
      c.gym_id,
      to_char(s.starts_at, 'DD Mon') AS class_date,
      to_char(s.starts_at, 'HH24:MI') AS class_time
    FROM class_sessions s
    JOIN class_types c 
      ON c.id = s.class_type_id
     AND c.gym_id = s.gym_id
    WHERE s.starts_at >= NOW()
      AND s.status = 'scheduled'
      AND s.gym_id = $1
    ORDER BY s.starts_at ASC
    LIMIT 5
  `;

  const { rows } = await db.query(query, [gymId]);
  return rows;
};

export const deleteSession = async (id, gymId) => {
  const result = await db.query(
    `DELETE FROM class_sessions 
     WHERE id = $1 AND gym_id = $2`,
    [id, gymId]
  );

  return result.rowCount; // 👈 important
};


export const updateSession = async (id, data, gymId) => {
  // Ensure the selected class type belongs to this gym.
  const classTypeResult = await db.query(
    `SELECT id, default_duration_minutes
     FROM class_types
     WHERE id = $1
       AND gym_id = $2
     LIMIT 1`,
    [data.class_type_id, gymId]
  );

  if (!classTypeResult.rows[0]) {
    const error = new Error("Class type not found for this gym");
    error.code = "CLASS_TYPE_NOT_FOUND";
    throw error;
  }

  const classType = classTypeResult.rows[0];

  const startsAt = new Date(`${data.date} ${data.time}`);

  if (Number.isNaN(startsAt.getTime())) {
    const error = new Error("Invalid session date or time");
    error.code = "INVALID_SESSION_DATETIME";
    throw error;
  }

  const endsAt = calcEndAt(
    startsAt,
    classType.default_duration_minutes
  );

  const query = `
    UPDATE class_sessions
    SET
      class_type_id = $1,
      starts_at = $2,
      start_time = $3,
      ends_at = $4,
      capacity = $5,
      location = $6,
      status = $7,
      updated_at = NOW()
    WHERE id = $8
      AND gym_id = $9
    RETURNING *
  `;

  const values = [
    classType.id,
    startsAt,
    data.time,
    endsAt,
    data.capacity,
    data.location,
    data.status,
    id,
    gymId
  ];

  const { rows } = await db.query(query, values);

  return rows[0];
};
