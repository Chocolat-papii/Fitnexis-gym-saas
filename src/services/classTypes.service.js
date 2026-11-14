import { db } from "../config/db.js";

export const getAll = async (gymId) => {
    const query = `
        SELECT id, name, description, default_duration_minutes, created_at
        FROM class_types
        WHERE gym_id = $1
        ORDER BY created_at DESC
    `;

    const { rows } = await db.query(query, [gymId]);
    return rows;
};

export const createClassType = async (data, gymId) => {
    if (!gymId) {
        throw Object.assign(new Error('Gym context is required to create a class type. Open your gym portal and try again.'), { status: 400 });
    }
    const query = `
        INSERT INTO class_types
        (name, description, default_duration_minutes, gym_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `;

    const { rows } = await db.query(query, [
        data.name,
        data.description,
        data.default_duration_minutes,
        gymId
    ]);

    return rows[0];
};

export const updateClassType = async (id, data, gymId) => {
    const query = `
        UPDATE class_types
        SET name = $1, description = $2, 
        default_duration_minutes = $3
        WHERE id = $4
        AND gym_id = $5
        RETURNING *
    `;

    const values = [
    data.name,
    data.description,
    data.default_duration_minutes,
    id,
    gymId
  ];

  const result = await db.query(query, values);

  return result.rows[0]; 
};

export const deleteClassType = async (id, gymId) => {
    const query = `DELETE FROM class_types 
    WHERE id = $1
    AND gym_id = $2
    RETURNING *`;
    const result = await db.query(query, [id, gymId]);
    return result.rowCount > 0;
};
