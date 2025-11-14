import Product from "../models/productModel.js";
import mongoose from "mongoose";

// CREATE - Add new product
export const createProduct = async (req, res) => {
  try {
    const { title, description, price } = req.body;

    // Validate required fields
    const missingFields = [];
    if (!title) missingFields.push("title");
    if (!description) missingFields.push("description");
    if (price === undefined || price === null) missingFields.push("price");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Get image from uploaded file
    let image = "";
    if (req.file) {
      image = req.file.path;
    } else {
      return res.status(400).json({
        success: false,
        error: "Product image is required",
      });
    }

    // Create new product
    const product = new Product({
      title,
      description,
      price,
      image,
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create product",
      details: error.message,
    });
  }
};

// READ - Get all products
export const getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const query = search
      ? {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Product.countDocuments(query);

    res.status(200).json({
      success: true,
      data: products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products",
      details: error.message,
    });
  }
};

// READ - Get single product by ID
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid product ID",
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch product",
      details: error.message,
    });
  }
};

// UPDATE - Update product
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid product ID",
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Update fields if provided
    if (title) product.title = title;
    if (description) product.description = description;
    if (price !== undefined && price !== null) product.price = price;
    if (isActive !== undefined) product.isActive = isActive;

    // Update image if new file uploaded
    if (req.file) {
      product.image = req.file.path;
    }

    await product.save();

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update product",
      details: error.message,
    });
  }
};

// DELETE - Delete product
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid product ID",
      });
    }

    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      data: product,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete product",
      details: error.message,
    });
  }
};
