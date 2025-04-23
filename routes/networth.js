import express from "express";
import { saveNetworthData } from "../controllers/networthCalculator.js";

const router = express.Router();
router.post("/save", saveNetworthData);

export default router;
