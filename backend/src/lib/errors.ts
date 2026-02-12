/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  public readonly details?: any;

  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * File size error (413)
 */
export class FileSizeError extends AppError {
  public readonly maxSize?: number;
  public readonly actualSize?: number;

  constructor(
    message: string = 'File size exceeds limit',
    maxSize?: number,
    actualSize?: number
  ) {
    super(message, 413, 'FILE_SIZE_EXCEEDED');
    this.maxSize = maxSize;
    this.actualSize = actualSize;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      maxSize: this.maxSize,
      actualSize: this.actualSize,
    };
  }
}

/**
 * Blockchain error (502/503)
 */
export class BlockchainError extends AppError {
  public readonly transactionId?: string;

  constructor(
    message: string = 'Blockchain operation failed',
    statusCode: number = 502,
    transactionId?: string
  ) {
    super(message, statusCode, 'BLOCKCHAIN_ERROR');
    this.transactionId = transactionId;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      transactionId: this.transactionId,
    };
  }
}

/**
 * Database error (500)
 */
export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR', false);
  }
}

/**
 * Error response helper
 */
export function errorResponse(error: Error | AppError, defaultStatus: number = 500): Response {
  if (error instanceof AppError) {
    return new Response(JSON.stringify(error.toJSON()), {
      status: error.statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Unknown error
  return new Response(JSON.stringify({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    details: error.message,
  }), {
    status: defaultStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}
