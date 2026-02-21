ALTER TABLE artwork_extras ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_artwork_extras_hidden ON artwork_extras(hidden) WHERE hidden = true;
