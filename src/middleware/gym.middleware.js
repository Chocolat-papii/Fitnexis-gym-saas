import { db } from "../config/db.js";

export const requireGym = async (req, res, next) => {
  try {
    const host = req.headers.host?.replace("www.", "");
    let gym;
    let slug;

    // -----------------------------
    // 1. Development / Heroku staging
    // -----------------------------
    if (
      host.includes("localhost") ||
      host.includes("herokuapp.com")
    ) {
      slug = req.headers["x-gym-slug"] || "mashfitness";

      if (!slug) {
        return res.status(400).json({
          error: "Gym slug required in dev/staging",
        });
      }
    }

    // -----------------------------
    // 2. Custom domain
    // Example: goldsgym.co.za
    // -----------------------------
    else {
      const customDomainResult = await db.query(
        "SELECT * FROM gyms WHERE custom_domain = $1",
        [host]
      );

      if (customDomainResult.rows.length) {
        gym = customDomainResult.rows[0];
      }

      // -----------------------------
      // 3. Fitnexis subdomain
      // Example: goldsgym.fitnexis.co.za
      // -----------------------------
      if (!gym) {
        const subdomain = host.split(".")[0];

        if (!subdomain || subdomain === "www") {
          return res.status(400).json({
            error: "Gym not specified",
          });
        }

        slug = subdomain;
      }
    }

    // -----------------------------
    // Final gym lookup (single lookup point)
    // -----------------------------
    if (!gym) {
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

    req.gym = gym;
    req.gymId = gym.id;

    next();

  } catch (err) {
    console.error("Gym middleware error:", err);
    return res.status(500).json({
      error: "Server error",
    });
  }
};