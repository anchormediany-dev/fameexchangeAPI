import express from "express";
import {
  addFriend,
  getFriendsByUser,
  updateFriend,
  deleteFriend,
} from "../controllers/friendController.js";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";

const router = express.Router();

router.post("/", auth_key_header, auth_token, addFriend);
router.delete("/", auth_key_header, auth_token, deleteFriend);
router.get("/", auth_key_header, auth_token, getFriendsByUser);
router.put("/:id", auth_key_header, auth_token, updateFriend);

export default router;
