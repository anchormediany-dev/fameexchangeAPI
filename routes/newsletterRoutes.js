// routes/newsletterRoutes.js
import express from "express";
import {
  subscribe,
  unsubscribe,
  list,
  remove,
} from "../controllers/newsletterController.js";
import authAdmin from "../middleware/auth_admin.js";

const router = express.Router();

router.post("/subscribe", subscribe);
router.post("/unsubscribe", unsubscribe);
router.get("/", authAdmin, list);
router.delete("/:id", authAdmin, remove);

export default router;
