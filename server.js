require("dotenv").config();

const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static("public"));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log("Supabase URL:", process.env.SUPABASE_URL);
console.log("Supabase key loaded:", !!process.env.SUPABASE_KEY);


// ==============================
// DATE / MEMBERSHIP FUNCTIONS
// ==============================

function calculateExpiryDate(startDate, months) {
  const expiry = new Date(startDate);

  expiry.setMonth(expiry.getMonth() + months);

  return expiry.toISOString().split("T")[0];
}

function getMembershipStatus(expiryDate) {
  const today = new Date();
  const expiry = new Date(expiryDate);

  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  const differenceInMilliseconds = expiry - today;

  const daysRemaining = Math.ceil(
    differenceInMilliseconds / (1000 * 60 * 60 * 24)
  );

  if (daysRemaining < 0) {
    return "Expired";
  }

  if (daysRemaining <= 5) {
    return "Expiring";
  }

  return "Active";
}


// ==============================
// AUTHENTICATION MIDDLEWARE
// ==============================

async function requireStaff(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: "Authentication required."
    });
  }

  const token = authHeader.replace("Bearer ", "");

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({
      error: "Invalid or expired token."
    });
  }

  req.user = data.user;

  next();
}


// ==============================
// HEALTH CHECK
// ==============================

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    test: "NEW SERVER"
  });
});


// ==============================
// GET ALL MEMBERS
// ==============================

app.get("/api/members", requireStaff, async (req, res) => {
  const { data, error } = await supabase
    .from("members")
    .select("*");

  console.log("MEMBERS DATA:", data);
  console.log("MEMBERS ERROR:", error);

  if (error) {
    return res.status(500).json({
      error: error.message
    });
  }

  const members = data.map((member) => ({
    ...member,
    status: getMembershipStatus(member.expiry_date)
  }));

  res.json(members);
});


// ==============================
// ADD MEMBER
// ==============================

app.post("/api/members", requireStaff, async (req, res) => {
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
      error: "All member information is required."
    });
  }

  const startDate = new Date();

  const expiryDate = calculateExpiryDate(
    startDate,
    Number(membershipMonths)
  );

  const { data, error } = await supabase
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
    return res.status(500).json({
      error: error.message
    });
  }

  res.status(201).json(data);
});


// ==============================
// UPDATE MEMBER
// ==============================

app.put("/api/members/:id", requireStaff, async (req, res) => {
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
      error: "All member information is required."
    });
  }

  const expiryDate = calculateExpiryDate(
    new Date(),
    Number(membershipMonths)
  );

  const { data, error } = await supabase
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
    return res.status(500).json({
      error: error.message
    });
  }

  res.json(data);
});


// ==============================
// DELETE MEMBER
// ==============================

app.delete("/api/members/:id", requireStaff, async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("members")
    .delete()
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({
      error: error.message
    });
  }

  res.json({
    message: "Member deleted successfully",
    member: data
  });
});


// ==============================
// STAFF LOGIN
// ==============================

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required."
    });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return res.status(401).json({
      error: error.message
    });
  }

  res.json({
    message: "Login successful",
    accessToken: data.session.access_token,
    user: data.user
  });
});


// ==============================
// START SERVER
// ==============================

app.listen(PORT, () => {
  console.log(`Gym server running on http://localhost:${PORT}`);
});