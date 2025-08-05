import express from "express";
import {
  getNetwothData,
  saveNetworthData,
} from "../controllers/networthCalculator.js";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";

const router = express.Router();
router.post("/save", auth_key_header, auth_token, saveNetworthData);
router.get("/", auth_key_header, auth_token, getNetwothData);

export default router;
