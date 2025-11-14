import express from "express";
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import auth_admin from "../middleware/auth_admin.js";
import uploadSingleFile from "../utils/multer_single_file_upload copy.js";

const router = express.Router();

// CREATE - Add new product (Admin only, with image upload)
router.post(
  "/",
  uploadSingleFile.single("image"),
  auth_key_header,
  auth_admin,
  createProduct
);

// READ - Get all products (with pagination and search)
router.get("/", auth_key_header, getAllProducts);

// READ - Get single product by ID
router.get("/:id", auth_key_header, getProductById);

// UPDATE - Update product (Admin only, with optional image upload)
router.patch(
  "/:id",
  uploadSingleFile.single("image"),
  auth_key_header,
  auth_admin,
  updateProduct
);

// DELETE - Delete product (Admin only)
router.delete("/:id", auth_key_header, auth_admin, deleteProduct);

export default router;
