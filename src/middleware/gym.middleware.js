import { db } from "../config/db.js";

const ROOT_DOMAINS = [
  "localhost:3000",
  "fitnexis.app",
  "www.fitnexis.app",
];

export const requireGym = async (req, res, next) => {
  try {
    const host = req.headers.host?.replace("www.", "");

    // -----------------------------------
    // 1. Allow platform landing pages
    // -----------------------------------
    if (
      ROOT_DOMAINS.includes(host) ||
      host === "localhost:3000"
    ) {
      return next();
    }

    let gym = null;
    let slug = null;

    // -----------------------------------
    // 2. Dev / staging mode
    // localhost with tenant simulation
    // Example:
    // localhost:3000 + x-gym-slug: goldsgym
    // -----------------------------------
    if (
      host.includes("localhost") ||
      host.includes("herokuapp.com")
    ) {
      slug = "llumar";

      // no slug = platform page
      if (!slug) {
        return next();
      }
    }

    // -----------------------------------
    // 3. Custom domain lookup
    // Example:
    // goldsgym.co.za
    // -----------------------------------
    else {
      const customDomainResult = await db.query(
        "SELECT * FROM gyms WHERE custom_domain = $1",
        [host]
      );

      if (customDomainResult.rows.length) {
        gym = customDomainResult.rows[0];
      }

      // -----------------------------------
      // 4. Fitnexis subdomain
      // Example:
      // goldsgym.fitnexis.co.za
      // -----------------------------------
      if (!gym) {
        const subdomain = host.split(".")[0];

        // prevent fitnexis.co.za becoming slug "fitnexis"
        if (
          !subdomain ||
          subdomain === "www" ||
          subdomain === "fitnexis"
        ) {
          return next();
        }

        slug = subdomain;
      }
    }

    // -----------------------------------
    // 5. Gym lookup
    // -----------------------------------
    if (!gym && slug) {
      const gymResult = await db.query(
        "SELECT * FROM gyms WHERE slug = $1",
        [slug]
      );

      if (!gymResult.rows.length) {
        return res.status(404).json({
          error: "Gym not found",
        });
      }

      gym = gymResult.rows[0];
    }

    // attach tenant if found
    if (gym) {
      req.gym = gym;
      req.gymId = gym.id;
    }

    next();

  } catch (err) {
    console.error("Gym middleware error:", err);

    return res.status(500).json({
      error: "Server error",
    });
  }
};