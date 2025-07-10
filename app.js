import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
dotenv.config();
import userRoutes from "./routes/user.js";
import authRoutes from "./routes/auth.js";
import userDocumentRoutes from "./routes/userDocuments.js";
import socialMediaRoutes from "./routes/socialMediaRoutes.js";
import keysRoutes from "./routes/keys.js";
import eventRoutes from "./routes/eventRoutes.js";
import CryptoTokenRoutes from "./routes/tokenRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import NetworthRoutes from "./routes/networth.js";
import connectToDatabase from "./config/db.js";
import { createInitialKeyIfNotExists } from "./controllers/keys.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Connect DB
connectToDatabase();
createInitialKeyIfNotExists()
  .then(() => console.log("Initial key check completed"))
  .catch((err) => console.error("Error initializing key:", err));
// Routes
app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user_documents", userDocumentRoutes);
app.use("/api/social-media", socialMediaRoutes);
app.use("/api/crypto_token", CryptoTokenRoutes);
app.use("/api/networth", NetworthRoutes);
app.use("/api/keys", keysRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/uploads", express.static("uploads"));

// Health Check Endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "UP" });
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
