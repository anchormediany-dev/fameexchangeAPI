import Product from "../models/productModel.js";
import mongoose from "mongoose";
import stripe from "../services/stripeClient.js";
import Payment from "../models/paymentModel.js";
import Talent from "../models/talentModel.js";
import { logTalentRevenue } from "../services/talentRevenueService.js";
import { sendOrderConfirmationEmail } from "../utils/emailFormats.js";

// CREATE - Add new product
export const createProduct = async (req, res) => {
  try {
    const { title, description, price, talentId, stock } = req.body;

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

    // Get image from uploaded file (S3 — see utils/multer_single_file_upload copy.js)
    let image = "";
    if (req.file) {
      image = req.file.location;
    } else {
      return res.status(400).json({
        success: false,
        error: "Product image is required",
      });
    }

    // Create new product
    // talentId is optional — attributes this product's sales to a talent's
    // dividend revenue pool (services/talentRevenueService.js) when set.
    // Products without one (existing/legacy, or merch not tied to a
    // specific talent) simply don't get logged as talent revenue.
    const product = new Product({
      title,
      description,
      price,
      image,
      // "" (blank field) or undefined -> null (untracked/unlimited stock)
      stock: stock === "" || stock === undefined ? null : Number(stock),
      ...(talentId ? { talentId } : {}),
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

    const escaped = search ? search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
    const query = escaped
      ? {
          $or: [
            { title: { $regex: escaped, $options: "i" } },
            { description: { $regex: escaped, $options: "i" } },
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
    const { title, description, price, isActive, stock } = req.body;

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
    if (stock !== undefined) {
      product.stock = stock === "" ? null : Number(stock);
    }

    // Update image if new file uploaded
    if (req.file) {
      product.image = req.file.location;
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
      // { name, email, phone, address: { line1, city, state, postal_code, country } }
      // — matches exactly what ProductCheckoutPage.jsx sends.
      customer = {},
    } = req.body;
    const billingAddress = customer.address || {};
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
    if (product.stock !== null && product.stock < quantity) {
      return res
        .status(400)
        .json({ success: false, error: "Not enough stock available" });
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
      ...(customer.email ? { receipt_email: customer.email } : {}),
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        productId: String(product._id),
        userId: String(userId),
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        customer_name: customer.name || "",
        customer_email: customer.email || "",
        billing_line1: billingAddress.line1 || "",
        billing_city: billingAddress.city || "",
        billing_state: billingAddress.state || "",
        billing_postal_code: billingAddress.postal_code || "",
        billing_country: billingAddress.country || "",
      },
    });
    // Upsert a local Payment record
    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: pi.id },
      {
        userId,
        productId: product._id,
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
          customer: {
            name: customer.name || "",
            email: customer.email || "",
            phone: customer.phone || "",
          },
          billingAddress,
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
      billingAddress,
    });
  } catch (err) {
    console.error("Stripe payment intent error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Stripe webhook for product payments
export const stripeProductWebhookNoSig = async (req, res) => {
  let event;
  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_PRODUCT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

  if (secret && sig) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
    }
  } else if (process.env.NODE_ENV !== "production") {
    event = req.body;
  } else {
    return res.status(400).json({ error: "Missing webhook signature" });
  }
  // Handle payment_intent events
  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.payment_failed" ||
    event.type === "payment_intent.canceled"
  ) {
    const pi = event.data.object;
    console.log("Received Stripe webhook for PaymentIntent:", pi.id, pi.status);
    const status = pi.status;
    const paymentIntentId = pi.id;
    // Extract billing address from metadata if present
    const billingAddress = {
      line1: pi.metadata?.billing_line1 || "",
      city: pi.metadata?.billing_city || "",
      state: pi.metadata?.billing_state || "",
      postal_code: pi.metadata?.billing_postal_code || "",
      country: pi.metadata?.billing_country || "",
    };
    // $set with dot notation (not a full `meta` replace) so `meta.title`/
    // `meta.image`, already set at creation time in createProductPaymentIntent,
    // survive this update instead of being wiped out.
    const payment = await Payment.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntentId },
      {
        $set: {
          status,
          "meta.customer": {
            name: pi.metadata?.customer_name || "",
            email: pi.metadata?.customer_email || "",
          },
          "meta.billingAddress": billingAddress,
          ...(status === "succeeded" ? { paidAt: new Date() } : {}),
        },
      },
      { new: true }
    );

    if (status === "succeeded" && pi.metadata?.productId) {
      try {
        const quantity = Number(pi.metadata.quantity) || 1;
        // Race-safe: only decrements if enough stock remains at write time;
        // untracked products (stock: null) never match this filter and are
        // simply skipped, matching the "null = unlimited" contract.
        await Product.updateOne(
          { _id: pi.metadata.productId, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } }
        );

        const product = await Product.findById(pi.metadata.productId).lean();

        // Best-effort talent-revenue logging — only when the purchased
        // product is attributed to a talent (Product.talentId, optional).
        if (product?.talentId && payment?.amount) {
          const talent = await Talent.findById(product.talentId).lean();
          if (talent) {
            await logTalentRevenue({
              talent_id: talent._id,
              talent_name: talent.name,
              revenue_type: "merchandise",
              amount: payment.amount,
              source_id: payment._id,
              source_description: `Merchandise sale: ${product.title}`,
            });
          }
        }

        if (pi.metadata.customer_email) {
          await sendOrderConfirmationEmail(pi.metadata.customer_email, {
            userName: pi.metadata.customer_name || "there",
            productTitle: product?.title || "your item",
            quantity,
            amount: payment?.amount,
            shippingAddress: billingAddress,
          });
        }
      } catch (err) {
        console.error("Post-payment merch processing failed (non-fatal):", err.message);
      }
    }
  }
  res.json({ received: true });
};
