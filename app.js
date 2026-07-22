import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import mongoose from "mongoose";
dotenv.config();
import userRoutes from "./routes/user.js";
import authRoutes from "./routes/auth.js";
import userDocumentRoutes from "./routes/userDocuments.js";
import socialMediaRoutes from "./routes/socialMediaRoutes.js";
import socialConnectionRoutes from "./routes/socialConnectionRoutes.js";
import keysRoutes from "./routes/keys.js";
import eventRoutes from "./routes/eventRoutes.js";
import CryptoTokenRoutes from "./routes/tokenRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import NetworthRoutes from "./routes/networth.js";
import friendRoutes from "./routes/friendRoutes.js";
import fanRequestRoutes from "./routes/fanRequestRoutes.js";
import talentConfirmationRoutes from "./routes/talentConfirmationRoutes.js";
import connectToDatabase from "./config/db.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import reminderRoutes from "./routes/remindersRoutes.js";
import newsletterRoutes from "./routes/newsletterRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";
import siteSettingsRoutes from "./routes/siteSettingsRoutes.js";
import faqRoutes from "./routes/faqRoutes.js";
import sponsorshipRoutes from "./routes/sponsorshipRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import talentTradingRoutes from "./routes/talentRoutes.js";
import tradeRoutes from "./routes/tradeRoutes.js";
import positionRoutes from "./routes/positionRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import adminTradingRoutes from "./routes/adminTradingRoutes.js";
import futuresRoutes from "./routes/futuresRoutes.js";
import famescoreRoutes from "./routes/famescoreRoutes.js";
import { createInitialKeyIfNotExists } from "./controllers/keys.js";
import { startFameScoreScheduler } from "./services/famescoreScheduler.js";
import { startFuturesScheduler } from "./services/futuresScheduler.js";

// ── Global process error guards ──────────────────────────────────────────────
process.on("unhandledRejection", (reason, promise) => {
  console.error("[unhandledRejection]", { promise, reason });
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

const ALLOWED_ORIGINS = [
  "https://app.thefameexchange.com",
  "https://famefutures.com",
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:5173", "http://localhost:5174"]
    : []),
];

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please slow down." },
});

const app = express();

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server, Postman, etc.)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Stripe webhook needs the raw request body for signature verification.
// Must run before express.json()/urlencoded() below, since body-parser
// middleware skips re-parsing once one of them has consumed the stream.
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  (req, _res, next) => {
    next();
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting — auth endpoints get a tighter window
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// Connect DB
connectToDatabase();
createInitialKeyIfNotExists()
  .then(() => console.log("Initial key check completed"))
  .catch((err) => console.error("Error initializing key:", err));

startFameScoreScheduler();
startFuturesScheduler();

// Routes
app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user_documents", userDocumentRoutes);
app.use("/api/social-media", socialMediaRoutes);
app.use("/api/social-connections", socialConnectionRoutes);
app.use("/api/crypto_token", CryptoTokenRoutes);
app.use("/api/networth", NetworthRoutes);
app.use("/api/keys", keysRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/fan-request", fanRequestRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/talent-confirmation", talentConfirmationRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/site-settings", siteSettingsRoutes);
app.use("/api/faqs", faqRoutes);
//remainders
app.use("/api/reminders", reminderRoutes);
//stripe billing routes
app.use("/api/billing", billingRoutes);

// sponsorship routes
app.use("/api/sponsorships", sponsorshipRoutes);

// product routes
app.use("/api/products", productRoutes);

// trading system routes
app.use("/api/talents", talentTradingRoutes);
app.use("/api/trades", tradeRoutes);
app.use("/api/positions", positionRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/admin", adminTradingRoutes);
app.use("/api/futures", futuresRoutes);
app.use("/api/famescore", famescoreRoutes);

app.use("/uploads", express.static("uploads"));
// Health Check Endpoint
app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  const status = dbState === 1 ? "UP" : "DEGRADED";
  res.status(dbState === 1 ? 200 : 503).json({
    status,
    db: dbState === 1 ? "connected" : "disconnected",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    switch (err.code) {
      case "LIMIT_UNEXPECTED_FILE":
        return res
          .status(400)
          .json({ message: "Unexpected file field or file count exceeded" });
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({ message: "File size limit exceeded" });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({ message: "Too many files uploaded" });
      case "LIMIT_FIELD_KEY":
        return res.status(400).json({ message: "Field key too large" });
      default:
        return res.status(400).json({ message: err.message });
    }
  } else if (err) {
    // General errors
    console.error(err.stack);
    return res
      .status(500)
      .json({ message: "An internal server error occurred" });
  }
  next();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
