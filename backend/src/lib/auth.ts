import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

export interface SessionPayload {
  userId: number;
  blockchainAccount: string;
  email: string;
  isAdmin: boolean;
}

// Create JWT token
export function createToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// Verify JWT token
export function verifyToken(token: string): SessionPayload {
  return jwt.verify(token, JWT_SECRET) as SessionPayload;
}

// Create session in database
export async function createSession(userId: number): Promise<string> {
  const token = createToken(await getUserPayload(userId));
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );

  return token;
}

// Revoke session
export async function revokeSession(token: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

// Check if session is valid
export async function isSessionValid(token: string): Promise<boolean> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await query(
    'SELECT id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()',
    [tokenHash]
  );
  return result.rowCount > 0;
}

// Get user payload from database
async function getUserPayload(userId: number): Promise<SessionPayload> {
  const result = await query(
    'SELECT blockchain_account, email, is_admin FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = result.rows[0];
  return {
    userId,
    blockchainAccount: user.blockchain_account,
    email: user.email,
    isAdmin: user.is_admin,
  };
}
