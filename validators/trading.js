import { z } from "zod";

export const createTalentSchema = z.object({
  name: z.string({ required_error: "Name is required" }).min(1, "Name is required"),
  slug: z.string({ required_error: "Slug is required" }).min(1, "Slug is required"),
  symbol: z.string({ required_error: "Symbol is required" }).min(1, "Symbol is required").max(10),
  // Either provide current_price directly, or set auto_price:true + userId to
  // have the initial price computed by the FameScore valuation engine.
  current_price: z.number().positive("Price must be positive").optional(),
  auto_price: z.boolean().optional(),
  spread: z.number().positive().optional(),
  liquidity_factor: z.number().positive().optional(),
  volatility_multiplier: z.number().positive().optional(),
  min_price: z.number().positive().optional(),
  max_price: z.number().positive().optional(),
  max_daily_move_percent: z.number().positive().optional(),
  max_move_per_trade: z.number().positive().optional(),
  min_order_amount: z.number().positive().optional(),
  max_order_amount: z.number().positive().optional(),
  userId: z.string().optional(),
  image: z.string().optional(),
  description: z.string().optional(),
}).refine(
  (data) => data.current_price != null || (data.auto_price && data.userId),
  { message: "Either current_price, or auto_price:true with a userId, is required" }
);

export const updateTalentSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  symbol: z.string().min(1).max(10).optional(),
  status: z.enum(["active", "suspended", "delisted"]).optional(),
  current_price: z.number().positive().optional(),
  spread: z.number().positive().optional(),
  liquidity_factor: z.number().positive().optional(),
  volatility_multiplier: z.number().positive().optional(),
  min_price: z.number().positive().optional(),
  max_price: z.number().positive().optional(),
  max_daily_move_percent: z.number().positive().optional(),
  max_move_per_trade: z.number().positive().optional(),
  min_order_amount: z.number().positive().optional(),
  max_order_amount: z.number().positive().optional(),
  image: z.string().optional(),
  description: z.string().optional(),
});

export const tradePreviewSchema = z.object({
  talent_id: z.string({ required_error: "Talent ID is required" }).min(1),
  side: z.enum(["buy", "sell"], { required_error: "Side is required (buy or sell)" }),
  amount: z.number({ required_error: "Amount is required" }).positive("Amount must be positive"),
});

export const tradeOpenSchema = z.object({
  talent_id: z.string({ required_error: "Talent ID is required" }).min(1),
  side: z.enum(["buy", "sell"], { required_error: "Side is required (buy or sell)" }),
  amount: z.number({ required_error: "Amount is required" }).positive("Amount must be positive"),
  quote_price: z.number().positive().optional(),
  idempotency_key: z.string().optional(),
});

export const adjustPriceSchema = z.object({
  new_price: z.number({ required_error: "New price is required" }).positive("Price must be positive"),
  reason: z.string().optional(),
});

export const createStakeSchema = z.object({
  talent_id: z.string({ required_error: "Talent ID is required" }).min(1),
  amount: z.number({ required_error: "Amount is required" }).positive("Amount must be positive"),
  lock_period_days: z.number({ required_error: "lock_period_days is required" }).refine(
    (v) => [30, 90, 180, 365].includes(v),
    { message: "lock_period_days must be 30, 90, 180, or 365" }
  ),
});
