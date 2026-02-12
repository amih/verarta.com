import { z } from 'zod';

export const emailSchema = z.string().email('Invalid email address').max(255);

export const displayNameSchema = z
  .string()
  .min(2, 'Display name must be at least 2 characters')
  .max(100, 'Display name must be at most 100 characters')
  .trim();

export const verificationCodeSchema = z
  .string()
  .length(6, 'Verification code must be 6 digits')
  .regex(/^\d{6}$/, 'Verification code must be 6 digits');

export const registerSchema = z.object({
  email: emailSchema,
  display_name: displayNameSchema,
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: verificationCodeSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
});

export const uploadSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(2000, 'Description too long').optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UploadInput = z.infer<typeof uploadSchema>;
