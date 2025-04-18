import express from "express";
const router = express.Router();
import auth_token from "../middleware/auth_token.js";
import auth_admin from "../middleware/auth_admin.js";
import auth_key_header from "../middleware/auth_key_header.js";
import { create, getAll, deleteKey } from "../controllers/keys.js";

// Create Key (POST)
router.post("/create", auth_token, auth_admin, create);

// Get all Keys (GET)
router.get("/get-all", auth_key_header, auth_token, auth_admin, getAll);

// Delete Key by ID (DELETE)
router.delete(
  "/delete/:id",
  auth_key_header,
  auth_token,
  auth_admin,
  deleteKey
);

export default router;
