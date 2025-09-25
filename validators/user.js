// signup.schema.ts
import { z } from "zod";

const talentItemSchema = z.object({
  category: z.string().min(1, "Talent category is required"),
  subcategories: z.array(z.string()).default([]),
});

const representationItemSchema = z.object({
  type: z.string().min(1, "Representative type is required"),
  name: z.string().min(1, "Representative name is required"),
  email: z.string().email("Invalid representative email"),
  phone: z.string().min(1, "Representative phone is required"),
});

export const signupSchema = z
  .object({
    name: z
      .string({ required_error: "Name is required" })
      .min(1, "Name cannot be empty"),
    email: z
      .string({ required_error: "Email is required" })
      .email("Invalid email format"),
    password: z
      .string({ required_error: "Password is required" })
      .min(6, "Password must be at least 6 characters long"),

    role: z.enum(
      ["ADMIN", "FAN", "TRADER", "TALENT", "ATHLETE", "INFLUENCER"],
      {
        required_error: "Role is required",
        invalid_type_error: "Invalid role selected",
      }
    ),

    // Arrays matching your payload
    talent: z.array(talentItemSchema).default([]),
    selected_reps: z.array(z.string()).default([]),
    representation: z.array(representationItemSchema).default([]),

    // Optional misc fields
    stage_name: z.string().optional(),
    usertype: z.string().optional(),
    is_active: z.boolean().optional(),
    is_verified: z.boolean().optional(),
    datetime: z.string().optional(),

    google_login_id: z.string().optional(),
    is_login_google: z.boolean().optional(),
    is_login_facebook: z.boolean().optional(),
    facebook_login_id: z.string().optional(),
    OTP_code: z.string().optional(),

    // Terms (must be true)
    is_over_18: z
      .boolean({ required_error: "You must be over 18." })
      .refine((v) => v === true, "You must be over 18."),
    agreed_terms: z
      .boolean({
        required_error: "You must agree to the terms and conditions.",
      })
      .refine((v) => v === true, "You must agree to the terms and conditions."),

    is_rep_have: z.boolean().default(false),
    rep_type: z.string().optional(),

    // Socials
    social_youtube: z.string().url("Invalid YouTube URL").optional(),
    social_twitter: z.string().url("Invalid Twitter URL").optional(),
    social_tiktok: z.string().url("Invalid TikTok URL").optional(),
    social_facebook: z.string().url("Invalid Facebook URL").optional(),
    social_insta: z.string().url("Invalid Instagram URL").optional(),
    social_snap: z.string().url("Invalid Snapchat URL").optional(),

    // Other optional profile fields
    full_name: z.string().optional(),
    token_brand_name: z.string().optional(),
    token_name: z.string().optional(),
    networth: z.string().optional(),
    lastlogin: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // If user has reps, enforce that each selected rep type has a matching representation entry
    if (data.is_rep_have) {
      if (!data.selected_reps?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selected_reps"],
          message: "Please select at least one representative type.",
        });
      }
      const selected = new Set(data.selected_reps || []);
      const provided = new Set((data.representation || []).map((r) => r.type));
      for (const type of selected) {
        if (!provided.has(type)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["representation"],
            message: `Missing representative details for "${type}".`,
          });
        }
      }
    }
  });
