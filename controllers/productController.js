import Product from "../models/productModel.js";
import mongoose from "mongoose";
import Stripe from "stripe";
import Payment from "../models/paymentModel.js";
import dotenv from "dotenv";
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

// Create Stripe PaymentIntent for product purchase
export const createProductPaymentIntent = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const {
      productId,
      quantity = 1,
      currency = "usd",
      customerId,
      billingAddress = {}, // { name, line1, line2, city, state, zip, country }
    } = req.body;
    if (!productId) {
      return res
        .status(400)
        .json({ success: false, error: "Missing productId" });
    }
    const product = await Product.findById(productId).lean();
    if (!product || !product.isActive) {
      return res
        .status(404)
        .json({ success: false, error: "Product not found or inactive" });
    }
    const unitPrice = product.price;
    const amount = unitPrice * quantity;
    const amountInMinor = Math.round(amount * 100); // Stripe expects cents
    if (amountInMinor < 50) {
      return res
        .status(400)
        .json({ success: false, error: "Amount too small" });
    }
    // Create Stripe PaymentIntent
    const pi = await stripe.paymentIntents.create({
      amount: amountInMinor,
      currency,
      ...(customerId ? { customer: customerId } : {}),
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        productId: String(product._id),
        userId: String(userId),
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        ...(billingAddress && typeof billingAddress === "object"
          ? {
              billing_name: billingAddress.name || "",
              billing_line1: billingAddress.line1 || "",
              billing_line2: billingAddress.line2 || "",
              billing_city: billingAddress.city || "",
              billing_state: billingAddress.state || "",
              billing_zip: billingAddress.zip || "",
              billing_country: billingAddress.country || "",
            }
          : {}),
      },
    });
    // Upsert a local Payment record
    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: pi.id },
      {
        userId,
        type: "product",
        quantity,
        currency,
        unitPrice,
        amount,
        amountInMinor,
        stripePaymentIntentId: pi.id,
        status: pi.status,
        meta: {
          title: product.title,
          image: product.image,
          billingAddress: billingAddress || {},
        },
      },
      { upsert: true, new: true }
    );
    res.json({
      success: true,
      productId: String(product._id),
      paymentIntent: pi,
      amount,
      amountInMinor,
      currency,
      title: product.title,
      image: product.image,
      billingAddress: billingAddress || {},
    });
  } catch (err) {
    console.error("Stripe payment intent error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Stripe webhook for product payments (no signature verification)
export const stripeProductWebhookNoSig = async (req, res) => {
  const event = req.body;
  // Handle payment_intent events
  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.payment_failed" ||
    event.type === "payment_intent.canceled"
  ) {
    const pi = event.data;
    console.log("Received Stripe webhook for PaymentIntent:", pi);
    // if (!pi?.id) break;
    const status = pi.status;
    const paymentIntentId = pi.id;
    // Extract billing address from metadata if present
    const billingAddress = {
      name: pi.metadata?.billing_name || "",
      line1: pi.metadata?.billing_line1 || "",
      line2: pi.metadata?.billing_line2 || "",
      city: pi.metadata?.billing_city || "",
      state: pi.metadata?.billing_state || "",
      zip: pi.metadata?.billing_zip || "",
      country: pi.metadata?.billing_country || "",
    };
    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntentId },
      {
        status,
        meta: {
          ...(pi.metadata || {}),
          billingAddress,
        },
        paidAt: status === "succeeded" ? new Date() : undefined,
      },
      { new: true }
    );
  }
  res.json({ received: true });
};
