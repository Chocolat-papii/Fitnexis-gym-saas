import { db } from "../config/db.js";


export const requireGym = async (req, res, next) => {
  try {
    const host = req.headers.host; 
    // e.g. goldsgym.yourapp.com OR www.goldsgym.com

    let gym;

    // 1. Check custom domain first (future-proof)
    const customDomainResult = await db.query(
      "SELECT * FROM gyms WHERE slug = $1",
      [host]
    );

  if (
  host.includes("localhost") ||
  host.includes("herokuapp.com")
) {
  const slug = req.headers["x-gym-slug"] || "mashfitness";

  const gymResult = await db.query(
    "SELECT * FROM gyms WHERE slug = $1",
    [slug]
  );

  if (!gymResult.rows.length) {
    return res.status(404).json({ error: "Gym not found (dev/staging mode)" });
  }

  req.gym = gymResult.rows[0];
  req.gymId = req.gym.id;

  return next();
}

    if (customDomainResult.rows.length) {
      gym = customDomainResult.rows[0];
    } else {

      
      // 2. Fallback to subdomain
      const subdomain = host.split('.')[0];

      if (!subdomain || subdomain === "www") {
        return res.status(400).json({ error: "Gym not specified" });
      }

      const subdomainResult = await db.query(
        "SELECT * FROM gyms WHERE slug = $1",
        [subdomain]
      );

      if (!subdomainResult.rows.length) {
        return res.status(404).json({ error: "Gym not found" });
      }

      gym = subdomainResult.rows[0];
    }

    // Attach FULL gym object (not just ID)
    req.gym = gym;
    req.gymId = gym.id;

    next();
  } catch (err) {
    console.error("Gym middleware error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};