import { z } from "zod";

const signupSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .min(1, "Name cannot be empty"),
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email format"),
  password: z
    .string({ required_error: "Password is required" })
    .min(6, "Password must be at least 6 characters long"),

  role: z.enum(["ADMIN", "FAN", "TRADER", "TALENT", "ATHLETE", "INFLUENCER"], {
    required_error: "Role is required",
    invalid_type_error: "Invalid role selected",
  }),

  usertype: z.string().optional(),
  is_active: z.boolean().optional(),
  is_verified: z.boolean().optional(),
  datetime: z.string().optional(),

  google_login_id: z.string().optional(),
  is_login_google: z.boolean().optional(),
  is_login_facebook: z.boolean().optional(),
  facebook_login_id: z.string().optional(),
  OTP_code: z.string().optional(),

  is_rep_have: z.boolean().optional(),
  rep_type: z.string().optional(),

  social_youtube: z.string().url("Invalid YouTube URL").optional(),
  social_twitter: z.string().url("Invalid Twitter URL").optional(),
  social_tiktok: z.string().url("Invalid TikTok URL").optional(),
  social_facebook: z.string().url("Invalid Facebook URL").optional(),
  social_insta: z.string().url("Invalid Instagram URL").optional(),
  social_snap: z.string().url("Invalid Snapchat URL").optional(),

  full_name: z.string().optional(),
  token_brand_name: z.string().optional(),
  token_name: z.string().optional(),
  networth: z.string().optional(),
  lastlogin: z.string().optional(),
});

export { signupSchema };
