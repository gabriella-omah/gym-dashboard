require("dotenv").config();
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const app = express();
const PORT = process.env.PORT || 4000;
app.use(express.json());
app.use(express.static("public"));
// ==================================================
// SUPABASE CONFIGURATION
// ==================================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_KEY;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("URL exists:", !!supabaseUrl);
console.log("ANON KEY exists:", !!supabaseAnonKey);
console.log(
  "SERVICE ROLE KEY exists:",
  !!supabaseServiceRoleKey
);
if (!supabaseUrl) {
  console.error("ERROR: SUPABASE_URL is missing.");
}
if (!supabaseAnonKey) {
  console.error("ERROR: SUPABASE_KEY is missing.");
}
if (!supabaseServiceRoleKey) {
  console.error(
    "ERROR: SUPABASE_SERVICE_ROLE_KEY is missing."
  );
}
// ==================================================
// TWO SUPABASE CLIENTS
// ==================================================
// Used for login/authentication
const supabaseAuth = createClient(
  supabaseUrl,
  supabaseAnonKey
);
// Used ONLY by the server for database operations.
// This key must NEVER be placed in HTML or frontend JavaScript.
const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
// ==================================================
// LOGIN PAGE
// ==================================================
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/login.html");
});
// ==================================================
// DATE / MEMBERSHIP FUNCTIONS
// ==================================================
function calculateExpiryDate(startDate, months) {
  const expiry = new Date(startDate);
  expiry.setMonth(
    expiry.getMonth() + Number(months)
  );
  return expiry.toISOString().split("T")[0];
}
function getMembershipStatus(expiryDate) {
  const today = new Date();
  const expiry = new Date(expiryDate);
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  const differenceInMilliseconds =
    expiry - today;
  const daysRemaining = Math.ceil(
    differenceInMilliseconds /
      (1000 * 60 * 60 * 24)
  );
  if (daysRemaining < 0) {
    return "Expired";
  }
  if (daysRemaining <= 5) {
    return "Expiring";
  }
  return "Active";
}
// ==================================================
// AUTHENTICATION MIDDLEWARE
// ==================================================
async function requireStaff(req, res, next) {
  try {
    const authHeader =
      req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        error: "Authentication required."
      });
    }
    const token =
      authHeader.replace("Bearer ", "");
    const {
      data,
      error
    } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) {
      console.error(
        "AUTH ERROR:",
        error
      );
      return res.status(401).json({
        error: "Invalid or expired token."
      });
    }
    req.user = data.user;
    next();
  } catch (error) {
    console.error(
      "AUTH MIDDLEWARE ERROR:",
      error
    );
    return res.status(500).json({
      error: "Authentication error."
    });
  }
}
// ==================================================
// HEALTH CHECK
// ==================================================
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Gym Dashboard API is running."
  });
});
// ==================================================
// GET ALL MEMBERS
// ==================================================
app.get(
  "/api/members",
  requireStaff,
  async (req, res) => {
    try {
      const {
        data,
        error
      } = await supabaseAdmin
        .from("members")
        .select("*")
        .order("id", {
          ascending: false
        });
      console.log(
        "MEMBERS DATA:",
        data
      );
      console.log(
        "MEMBERS ERROR:",
        error
      );
      if (error) {
        return res.status(500).json({
          error: error.message
        });
      }
      const members = data.map(
        (member) => ({
          ...member,
          status:
            getMembershipStatus(
              member.expiry_date
            )
        })
      );
      res.json(members);
    } catch (error) {
      console.error(
        "GET MEMBERS ERROR:",
        error
      );
      res.status(500).json({
        error:
          "Unable to load members."
      });
    }
  }
);
// ==================================================
// ADD MEMBER
// ==================================================
app.post(
  "/api/members",
  requireStaff,
  async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        membershipMonths
      } = req.body;
      if (
        !firstName ||
        !lastName ||
        !email ||
        !phone ||
        !membershipMonths
      ) {
        return res.status(400).json({
          error:
            "All member information is required."
        });
      }
      const expiryDate =
        calculateExpiryDate(
          new Date(),
          membershipMonths
        );
      console.log(
        "ADDING MEMBER:",
        {
          firstName,
          lastName,
          email,
          phone,
          membershipMonths,
          expiryDate
        }
      );
      const {
        data,
        error
      } = await supabaseAdmin
        .from("members")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: phone,
          expiry_date: expiryDate
        })
        .select()
        .single();
      if (error) {
        console.error(
          "ADD MEMBER ERROR:",
          error
        );
        return res.status(500).json({
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
      }
      console.log(
        "MEMBER ADDED:",
        data
      );
      return res.status(201).json(data);
    } catch (error) {
      console.error(
        "ADD MEMBER SERVER ERROR:",
        error
      );
      return res.status(500).json({
        error:
          "Unable to add member."
      });
    }
  }
);
// ==================================================
// UPDATE MEMBER
// ==================================================
app.put(
  "/api/members/:id",
  requireStaff,
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        firstName,
        lastName,
        email,
        phone,
        membershipMonths
      } = req.body;
      if (
        !firstName ||
        !lastName ||
        !email ||
        !phone ||
        !membershipMonths
      ) {
        return res.status(400).json({
          error:
            "All member information is required."
        });
      }
      const expiryDate =
        calculateExpiryDate(
          new Date(),
          membershipMonths
        );
      const {
        data,
        error
      } = await supabaseAdmin
        .from("members")
        .update({
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: phone,
          expiry_date: expiryDate
        })
        .eq("id", id)
        .select()
        .single();
      if (error) {
        console.error(
          "UPDATE MEMBER ERROR:",
          error
        );
        return res.status(500).json({
          error: error.message
        });
      }
      res.json(data);
    } catch (error) {
      console.error(
        "UPDATE MEMBER SERVER ERROR:",
        error
      );
      res.status(500).json({
        error:
          "Unable to update member."
      });
    }
  }
);
// ==================================================
// DELETE MEMBER
// ==================================================
app.delete(
  "/api/members/:id",
  requireStaff,
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        data,
        error
      } = await supabaseAdmin
        .from("members")
        .delete()
        .eq("id", id)
        .select()
        .single();
      if (error) {
        console.error(
          "DELETE MEMBER ERROR:",
          error
        );
        return res.status(500).json({
          error: error.message
        });
      }
      res.json({
        message:
          "Member deleted successfully.",
        member: data
      });
    } catch (error) {
      console.error(
        "DELETE MEMBER SERVER ERROR:",
        error
      );
      res.status(500).json({
        error:
          "Unable to delete member."
      });
    }
  }
);
// ==================================================
// STAFF LOGIN
// ==================================================
app.post(
  "/api/login",
  async (req, res) => {
    try {
      const {
        email,
        password
      } = req.body;
      if (!email || !password) {
        return res.status(400).json({
          error:
            "Email and password are required."
        });
      }
      const {
        data,
        error
      } = await supabaseAuth.auth
        .signInWithPassword({
          email,
          password
        });
      if (error) {
        console.error(
          "LOGIN ERROR:",
          error
        );
        return res.status(401).json({
          error: error.message
        });
      }
      return res.json({
        message:
          "Login successful",
        accessToken:
          data.session.access_token,
        user: data.user
      });
    } catch (error) {
      console.error(
        "LOGIN SERVER ERROR:",
        error
      );
      return res.status(500).json({
        error:
          "Unable to login."
      });
    }
  }
);
// ==================================================
// START SERVER
// ==================================================
app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Gym server running on port ${PORT}`
    );
  }
);