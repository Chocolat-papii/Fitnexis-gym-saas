import { db } from "../../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";


export const viewRegisterPage = async (req, res, next) => {
   res.render("landing/register-gym");
};

export const registerGym = async (req, res) => {
  try {
    const {
      name,
      slug,
      gymMail,
      address,
      
      firstname,
      lastname,
      phone,
      email,
      password,
    } = req.body;

    if (!name || !slug || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // 1. Check if gym already exists
    const existingGym = await db.query(
      "SELECT id FROM gyms WHERE slug = $1",
      [slug]
    );

    if (existingGym.rows.length) {
      return res.status(400).json({
        success: false,
        message: "Gym already exists"
      });
    }

    // 2. Create gym
    const gymResult = await db.query(
      `INSERT INTO gyms (name, slug, email, address)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [name, slug.toLowerCase(), email, address]
    );

    const gymId = gymResult.rows[0].id;

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Create admin
    const userResult = await db.query(
      `INSERT INTO users
      (firstname, lastname, phone, email, password, role, gym_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [
        firstname,
        lastname,
        phone,
        email.toLowerCase(),
        hashedPassword,
        "admin",
        gymId
      ]
    );

    const user = userResult.rows[0];

    // 5. Generate token
    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        gymId: user.gym_id
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    // 6. Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    });

    return res.status(201).json({
      success: true,
      message: "Gym registered successfully",
      redirect: "/register-gym"
    });

  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
};