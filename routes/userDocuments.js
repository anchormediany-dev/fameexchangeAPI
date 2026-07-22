// routes/documentRoutes.js
import express from "express";
import auth_admin from "../middleware/auth_admin.js";
import {
  deleteRejectedUserDocument,
  getAllUserDocuments,
  getKycId,
  getUserDocumentsByUserId,
  uploadUserDocuments,
  verifyOrRejectUserDocument,
} from "../controllers/userDocuments.js";
import upload from "../utils/multer_multiple_file_upload.js";
import auth_token from "../middleware/auth_token.js";
import auth_key_header from "../middleware/auth_key_header.js";
const router = express.Router();

// Route to handle upload documents
router.post(
  "/upload-docs",
  auth_key_header,
  auth_token,
  // upload.array("images", 10),
  upload.any(),
  uploadUserDocuments
);
// Admin verifies or rejects the document
router.put(
  "/verify-or-reject/:documentId",
  auth_key_header,
  auth_admin,
  verifyOrRejectUserDocument
);

router.get("/", auth_key_header, auth_token, getUserDocumentsByUserId);
router.get(
  "/all-user-documents",
  auth_key_header,
  auth_admin,
  getAllUserDocuments
);
router.get("/kyc/:id", auth_key_header, auth_admin, getKycId);
//if document reject then delete the previous uplaoded documents
router.delete(
  "/delete/:documentId",
  auth_key_header,
  auth_token,
  deleteRejectedUserDocument
);

export default router;
