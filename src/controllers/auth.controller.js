import path from "path";
import bcrypt from "bcrypt";
import { fileURLToPath } from "url";
import { db } from "../config/db.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// working
export const getSignUpForm = (req, res) => {
 return res.render("landing/partials/sign-up-form", {
      gym: req.gym
    });};

// Working
export const signUp = async (req, res) => {

  try {
    const { firstname, lastname, phone, email, password } = req.body;
    const gymId = req.gymId;

    if (!firstname || !lastname || !phone || !email || !password) {
      return res.status(400).json({ 
        message: "All fields are required." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO users (firstname, lastname, phone, email, password, gym_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, firstname, lastname, phone, email, gym_id;
    `;

    const values = [firstname, lastname, phone, email, hashedPassword, gymId];

    const result = await db.query(query, values);

    return res.status(201).json({
      message: "Acccount created successfully!",
      user: result.rows[0],
      redirect: "/login",
    }); 
;

    } catch (err) {
    // handle duplicate email 
    if (err.code === "23505") {
      return res.status(409).json({ 
        message: "Email already exists. Try logging in",
        redirect: "/login",
      });
    }
    console.error(err);
    return res.status(500).json({ 
      message: "Server error",
     });
  }

  };


