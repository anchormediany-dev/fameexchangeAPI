import mongoose from "mongoose";

// models/Ticket.js (example)
const TicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      index: true,
    },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    quantity: { type: Number, default: 1 },
    status: { type: String, default: "CONFIRMED" }, // or "CANCELLED"
  },
  { timestamps: true }
);

export default mongoose.model("Ticket", TicketSchema);
