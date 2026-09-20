require("dotenv").config();
// Strip BOM (U+FEFF) that PowerShell sometimes injects into env vars
Object.keys(process.env).forEach(k => {
  if (process.env[k] && process.env[k].charCodeAt(0) === 0xFEFF) {
    process.env[k] = process.env[k].slice(1);
  }
});
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

// Comma-separated list in ALLOWED_ORIGINS; FRONTEND_URL is always allowed.
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  ...(process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
];

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// CORS must come first — before rate limiter and helmet — so preflight OPTIONS
// requests always get the right headers even when other middleware rejects
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // explicit preflight for all routes (regex avoids Express 5 path-to-regexp rejection of bare "*")

// Security headers
app.use(helmet({
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: false,     // API serves JSON only; frontend headers are set in frontend/vercel.json
  crossOriginResourcePolicy: false, // Allow cross-origin API responses
}));

// Trust Vercel / reverse-proxy forwarded IPs (required for express-rate-limit on Vercel)
app.set("trust proxy", 1);

// Rate limits
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },  // suppress Vercel proxy header warnings
  message: { error: "Too many requests, please try again later." },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: "Too many auth requests, please try again later." },
});
app.use(globalLimiter);
app.use("/api/auth", authLimiter);
app.use(express.json({ limit: "2mb" }));

// Authentication is Supabase Auth — tokens are verified in middleware/auth.js
// using SUPABASE_JWT_SECRET (or supabase.auth.getUser as a fallback).
if (!process.env.SUPABASE_JWT_SECRET) {
  console.warn("⚠️ SUPABASE_JWT_SECRET not set — falling back to remote token validation.");
}


// Health / info endpoints
app.get("/health",    (_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));
app.get("/api/health",(_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));
app.get("/api", (_, res) => res.json({ message: "Sales CRM API", version: "2.0.0" }));

// Routes
app.use("/api/auth",          require("./routes/auth"));
app.use("/api/organizations", require("./routes/organizations"));
app.use("/api/users",      require("./routes/users"));
app.use("/api/leads",      require("./routes/leads"));
app.use("/api/deals",      require("./routes/deals"));
app.use("/api/activities", require("./routes/activities"));
app.use("/api/analytics",  require("./routes/analytics"));
app.use("/api/ai",         require("./routes/ai"));
app.use("/api/ai/documents", require("./routes/aiDocuments"));
app.use("/api/meetings",   require("./routes/meetings"));
app.use("/api/oauth",      require("./routes/oauth"));
app.use("/api/targets",    require("./routes/targets"));
app.use("/api/email",          require("./routes/email"));
app.use("/api/reports",        require("./routes/reports"));
app.use("/api/calendar-sync",  require("./routes/calendarSync"));


// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// Export app for Vercel serverless
module.exports = app;

// Start server only when running locally (not in Vercel or other cloud envs)
const isCloudEnv = process.env.VERCEL || process.env.FUNCTION_TARGET || process.env.K_SERVICE;
if (!isCloudEnv) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Sales CRM backend running on port ${PORT}`);
    const { startCronJobs } = require("./utils/cronJobs");
    startCronJobs();
  });
}
