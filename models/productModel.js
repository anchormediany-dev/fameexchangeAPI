import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    image: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // null = untracked/unlimited (no oversell protection applied). A real
    // number enables it — createProductPaymentIntent rejects purchases that
    // exceed it, and the Stripe webhook decrements it on success.
    stock: {
      type: Number,
      default: null,
      min: 0,
    },
    // Optional talent attribution — lets a merchandise sale be logged as
    // that talent's revenue (services/talentRevenueService.js,
    // controllers/productController.js). Null for existing/legacy products
    // or merch not tied to a specific talent; those sales simply aren't
    // logged as talent revenue.
    talentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Talent",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Product = mongoose.model("Product", productSchema);

export default Product;
