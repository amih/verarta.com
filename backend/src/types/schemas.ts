import { z } from 'zod';

/**
 * Email validation schema
 */
export const EmailSchema = z
  .string()
  .email('Invalid email address')
  .max(255, 'Email must be less than 255 characters');

/**
 * Blockchain account name validation schema
 * Antelope accounts: 1-12 characters, lowercase a-z, numbers 1-5, and dots
 */
export const AccountNameSchema = z
  .string()
  .min(1, 'Account name must be at least 1 character')
  .max(12, 'Account name must be at most 12 characters')
  .regex(
    /^[a-z1-5.]+$/,
    'Account name can only contain lowercase letters (a-z), numbers (1-5), and dots'
  );

/**
 * Display name validation schema
 */
export const DisplayNameSchema = z
  .string()
  .min(2, 'Display name must be at least 2 characters')
  .max(100, 'Display name must be less than 100 characters')
  .trim();

/**
 * Artwork title validation schema
 */
export const ArtworkTitleSchema = z
  .string()
  .min(1, 'Title is required')
  .max(255, 'Title must be less than 255 characters')
  .trim();

/**
 * File name validation schema
 */
export const FileNameSchema = z
  .string()
  .min(1, 'Filename is required')
  .max(255, 'Filename must be less than 255 characters');

/**
 * MIME type validation schema
 */
export const MimeTypeSchema = z
  .string()
  .min(1, 'MIME type is required')
  .max(100, 'MIME type must be less than 100 characters')
  .regex(/^[a-z]+\/[a-z0-9+.-]+$/i, 'Invalid MIME type format');

/**
 * Verification code validation schema (6 digits)
 */
export const VerificationCodeSchema = z
  .string()
  .length(6, 'Verification code must be exactly 6 digits')
  .regex(/^\d{6}$/, 'Verification code must contain only digits');

/**
 * UUID validation schema
 */
export const UuidSchema = z
  .string()
  .uuid('Invalid UUID format');

/**
 * Positive integer validation schema
 */
export const PositiveIntSchema = z
  .number()
  .int('Must be an integer')
  .positive('Must be a positive number');

/**
 * Non-negative integer validation schema
 */
export const NonNegativeIntSchema = z
  .number()
  .int('Must be an integer')
  .nonnegative('Must be a non-negative number');

/**
 * Base64 data validation schema
 */
export const Base64Schema = z
  .string()
  .regex(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    'Invalid base64 format'
  );

/**
 * Pagination parameters schema
 */
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

/**
 * File upload size validation
 */
export const FILE_SIZE_LIMITS = {
  FREE_ACCOUNT: 5 * 1024 * 1024, // 5 MB
  PREMIUM_ACCOUNT: 50 * 1024 * 1024, // 50 MB
  MAX_ALLOWED: 100 * 1024 * 1024, // 100 MB absolute max
} as const;

/**
 * Image resolution limits
 */
export const IMAGE_RESOLUTION_LIMITS = {
  FREE_ACCOUNT: 1920 * 1080, // Full HD
  PREMIUM_ACCOUNT: 4096 * 2160, // 4K
} as const;

/**
 * Validate file size based on account tier
 */
export function validateFileSize(
  fileSize: number,
  accountTier: 'free' | 'premium' = 'free'
): boolean {
  const limit =
    accountTier === 'premium'
      ? FILE_SIZE_LIMITS.PREMIUM_ACCOUNT
      : FILE_SIZE_LIMITS.FREE_ACCOUNT;

  return fileSize > 0 && fileSize <= limit;
}

/**
 * Validate image resolution based on account tier
 */
export function validateImageResolution(
  width: number,
  height: number,
  accountTier: 'free' | 'premium' = 'free'
): boolean {
  const limit =
    accountTier === 'premium'
      ? IMAGE_RESOLUTION_LIMITS.PREMIUM_ACCOUNT
      : IMAGE_RESOLUTION_LIMITS.FREE_ACCOUNT;

  return width * height <= limit;
}

/**
 * Common MIME types for validation
 */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'application/json',
] as const;

export const ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
] as const;

/**
 * Check if MIME type is allowed
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType as any);
}

/**
 * Check if MIME type is an image
 */
export function isImageMimeType(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(mimeType as any);
}
