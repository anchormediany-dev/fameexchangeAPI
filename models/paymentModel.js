// models/Payment.js
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    // NEW: categorize payments
    type: { type: String, enum: ["session", "event"], required: true },
    quantity: { type: Number, default: 1 },
    currency: { type: String, default: "usd" },
    paidAt: { type: Date },
    unitPrice: { type: Number, required: true }, // major units (e.g., 29.99)
    amount: { type: Number, required: true }, // total major units
    amountInMinor: { type: Number, required: true }, // e.g., cents
    stripePaymentIntentId: { type: String, index: true },
    status: {
      type: String,
      enum: [
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "processing",
        "succeeded",
        "canceled",
        "payment_failed",
      ],
      default: "requires_payment_method",
    },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
