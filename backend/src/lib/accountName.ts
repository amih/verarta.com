import crypto from 'crypto';

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
