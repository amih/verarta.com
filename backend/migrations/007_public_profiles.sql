-- Username & profile fields on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(64) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Public thumbnail URL on artwork_extras (unencrypted image served from filesystem)
ALTER TABLE artwork_extras ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
