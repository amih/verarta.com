ALTER TABLE users ADD COLUMN IF NOT EXISTS antelope_public_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS antelope_encrypted_private_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS antelope_key_nonce TEXT;
