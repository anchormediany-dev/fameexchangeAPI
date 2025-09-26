import mongoose from "mongoose";

const AttendeeSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional, if registered
});

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
    attendees: { type: [AttendeeSchema], default: [] },
    no_of_persons: { type: Number },
    status: { type: String, default: "CONFIRMED" }, // or "CANCELLED"
    isFree: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Ticket", TicketSchema);
