import crypto from 'crypto';
import { query } from './db.js';

const RESERVED_NAMES = new Set(['deleted']);

// Generate valid Antelope account name (12 chars, a-z, 1-5)
export function generateAccountName(prefix: string = 'user'): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz12345';
  const randomBytes = crypto.randomBytes(8);

  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars[randomBytes[i] % chars.length];
  }

  let name = (prefix + suffix).substring(0, 12);

  // Regenerate if we hit a reserved name (astronomically unlikely but safe)
  while (RESERVED_NAMES.has(name)) {
    const newBytes = crypto.randomBytes(8);
    let newSuffix = '';
    for (let i = 0; i < 8; i++) {
      newSuffix += chars[newBytes[i] % chars.length];
    }
    name = (prefix + newSuffix).substring(0, 12);
  }

  return name;
}

export function isValidAccountName(name: string): boolean {
  if (name.length > 12) return false;
  return /^[a-z1-5.]+$/.test(name);
}

// Generate a unique username from a display name
export async function generateUsername(displayName: string): Promise<string> {
  // Convert to URL-friendly: lowercase, keep alphanumeric, replace spaces/special with nothing
  let base = displayName
    .trim()
    .replace(/\s+/g, '')           // remove spaces
    .replace(/[^a-zA-Z0-9]/g, '')  // remove non-alphanumeric
    .substring(0, 20);

  if (!base) {
    base = 'user';
  }

  // Check if this username is taken
  const existing = await query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
    [base]
  );

  if (existing.rows.length === 0) {
    return base;
  }

  // Append numbers until unique
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${i}`;
    const check = await query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [candidate]
    );
    if (check.rows.length === 0) {
      return candidate;
    }
  }

  // Fallback: random suffix
  return base + crypto.randomBytes(4).toString('hex');
}
