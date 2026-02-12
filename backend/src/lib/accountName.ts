import crypto from 'crypto';

// Generate valid Antelope account name (12 chars, a-z, 1-5)
export function generateAccountName(prefix: string = 'user'): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz12345';
  const randomBytes = crypto.randomBytes(8);

  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars[randomBytes[i] % chars.length];
  }

  const name = prefix + suffix;
  return name.substring(0, 12); // Ensure 12 chars max
}

export function isValidAccountName(name: string): boolean {
  if (name.length > 12) return false;
  return /^[a-z1-5.]+$/.test(name);
}
