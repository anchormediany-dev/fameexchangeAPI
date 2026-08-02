import mongoose from "mongoose";

// Feeds the quarterly dividend pool calculation (services/dividendScheduler.js
// sums these per talent per quarter). Created via
// services/talentRevenueService.js's logTalentRevenue(). Only
// "appearance_fees" and "merchandise" are actually wired up to real revenue
// today (controllers/billingController.js, controllers/productController.js)
// — the other enum values are kept for spec parity but have no caller yet;
// fan subscriptions, crowdfunding fees, brand deal fees, and exclusive
// content don't exist as real payment flows in this codebase.
const talentRevenueSourceSchema = new mongoose.Schema(
  {
    talent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Talent",
      required: true,
      index: true,
    },
    talent_name: { type: String, required: true },
    revenue_type: {
      type: String,
      enum: [
        "fan_subscriptions",
        "crowdfunding_fees",
        "brand_deal_fees",
        "exclusive_content",
        "booking_fees",
        "merchandise",
        "appearance_fees",
      ],
      required: true,
    },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    source_id: { type: mongoose.Schema.Types.ObjectId, default: null }, // polymorphic — the originating Payment/FanInverseRequest/etc doc
    source_description: { type: String, default: null },

    quarter: { type: String, required: true, index: true }, // "2026-Q3"
    date_recorded: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

talentRevenueSourceSchema.index({ talent_id: 1, quarter: 1 });

const TalentRevenueSource = mongoose.model("TalentRevenueSource", talentRevenueSourceSchema);
export default TalentRevenueSource;
