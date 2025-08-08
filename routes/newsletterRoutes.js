// routes/newsletterRoutes.js
import express from "express";
import {
  subscribe,
  unsubscribe,
  list,
  remove,
} from "../controllers/newsletterController.js";

const router = express.Router();

router.post("/subscribe", subscribe);
router.post("/unsubscribe", unsubscribe);
router.get("/", list);
router.delete("/:id", remove);

export default router;
