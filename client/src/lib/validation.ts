import { z } from "zod";

/**
 * Form Validation Schemas
 * 
 * This file contains Zod validation schemas for all forms in the application.
 * Use these with react-hook-form's zodResolver for consistent validation.
 */

// ============= BRAND & ONBOARDING =============

export const brandDomainSchema = z.object({
  domain: z
    .string()
    .min(1, "Domain is required")
    .regex(
      /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i,
      "Please enter a valid domain (e.g., example.com)"
    ),
});

export const brandDetailsSchema = z.object({
  name: z
    .string()
    .min(2, "Brand name must be at least 2 characters")
    .max(100, "Brand name must be less than 100 characters"),
  industry: z
    .string()
    .min(2, "Industry must be at least 2 characters")
    .max(50, "Industry must be less than 50 characters")
    .optional(),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(500, "Description must be less than 500 characters")
    .optional(),
  website: z
    .string()
    .url("Please enter a valid URL")
    .optional()
    .or(z.literal("")),
  logo: z
    .string()
    .url("Please enter a valid logo URL")
    .optional()
    .or(z.literal("")),
});

export const competitorSchema = z.object({
  name: z
    .string()
    .min(2, "Competitor name must be at least 2 characters")
    .max(100, "Competitor name must be less than 100 characters"),
  domain: z
    .string()
    .min(1, "Domain is required")
    .regex(
      /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i,
      "Please enter a valid domain (e.g., competitor.com)"
    ),
  isTracked: z.boolean().default(true),
});

// ============= PROMPTS & TOPICS =============

export const promptSchema = z.object({
  text: z
    .string()
    .min(10, "Prompt must be at least 10 characters")
    .max(500, "Prompt must be less than 500 characters"),
  category: z
    .enum(["product", "comparison", "how-to", "pricing", "features", "alternatives", "reviews", "other"])
    .default("other"),
  topicId: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const topicSchema = z.object({
  name: z
    .string()
    .min(2, "Topic name must be at least 2 characters")
    .max(100, "Topic name must be less than 100 characters"),
  category: z
    .enum(["product", "industry", "use-case", "comparison", "technical", "other"])
    .default("other"),
  importance: z
    .enum(["low", "medium", "high", "critical"])
    .default("medium"),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
});

// ============= USER & SETTINGS =============

export const passwordChangeSchema = z.object({
  oldPassword: z
    .string()
    .min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  confirmPassword: z
    .string()
    .min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const userProfileSchema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(50, "First name must be less than 50 characters"),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(50, "Last name must be less than 50 characters"),
  email: z
    .string()
    .email("Please enter a valid email address"),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Please enter a valid phone number")
    .optional()
    .or(z.literal("")),
});

// ============= CONTENT & AXP =============

export const axpPageSchema = z.object({
  url: z
    .string()
    .url("Please enter a valid URL"),
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be less than 200 characters"),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  schemaType: z
    .enum(["Organization", "Product", "FAQPage", "Article", "WebPage", "LocalBusiness"])
    .default("WebPage"),
});

export const faqSchema = z.object({
  question: z
    .string()
    .min(10, "Question must be at least 10 characters")
    .max(300, "Question must be less than 300 characters"),
  answer: z
    .string()
    .min(20, "Answer must be at least 20 characters")
    .max(1000, "Answer must be less than 1000 characters"),
  category: z
    .string()
    .max(50, "Category must be less than 50 characters")
    .optional(),
});

// ============= TYPE EXPORTS =============

export type BrandDomainFormData = z.infer<typeof brandDomainSchema>;
export type BrandDetailsFormData = z.infer<typeof brandDetailsSchema>;
export type CompetitorFormData = z.infer<typeof competitorSchema>;
export type PromptFormData = z.infer<typeof promptSchema>;
export type TopicFormData = z.infer<typeof topicSchema>;
export type PasswordChangeFormData = z.infer<typeof passwordChangeSchema>;
export type UserProfileFormData = z.infer<typeof userProfileSchema>;
export type AxpPageFormData = z.infer<typeof axpPageSchema>;
export type FaqFormData = z.infer<typeof faqSchema>;

