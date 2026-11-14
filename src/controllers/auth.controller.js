import path from "path";
import bcrypt from "bcrypt";
import { fileURLToPath } from "url";
import { db } from "../config/db.js";
import {audit} from "../services/audit.service.js";
import {enforceLimit} from "../services/saasBilling.service.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// working
export const getSignUpForm = (req, res) => {
 return res.render("landing/partials/sign-up-form", {
      gym: req.gym
    });};

// Working
export const signUp = async (req, res) => {
  const client=await db.connect();

  try {
    const { firstname, lastname, phone, email, password } = req.body;
    const gymId = req.gymId;

    if (!firstname || !lastname || !phone || !email || !password) {
      return res.status(400).json({ 
        message: "All fields are required." });
    }

    if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)return res.status(400).json({message:'Use a password of at least 12 characters (maximum 72 bytes).'});
    if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>255||!gymId)return res.status(400).json({message:'Enter a valid gym email address.'});
    await client.query('BEGIN');await client.query('SELECT id FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);await enforceLimit(client,gymId,'members');
    const hashedPassword = await bcrypt.hash(password, 12);

    const query = `
      INSERT INTO users (firstname, lastname, phone, email, password, gym_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, firstname, lastname, phone, email, gym_id;
    `;

    const values = [firstname, lastname, phone, email, hashedPassword, gymId];

    const result = await client.query(query, values);
    await audit(client,{scope:'gym',id:result.rows[0].id},'member.registered',gymId,String(result.rows[0].id));await client.query('COMMIT');

    return res.status(201).json({
      message: "Acccount created successfully!",
      user: result.rows[0],
      redirect: "/login",
    }); 
;

    } catch (err) {
    await client.query('ROLLBACK');
    // handle duplicate email 
    if (err.code === "23505") {
      return res.status(409).json({ 
        message: "Email already exists. Try logging in",
        redirect: "/login",
      });
    }
    console.error(err);
    return res.status(err.status||500).json({
      message: err.status?err.message:'Server error',
     });
  } finally {client.release();}

  };
