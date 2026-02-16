-- OAuth and avatar support
-- Adds SSO provider tracking and profile image URL to users

ALTER TABLE users ADD COLUMN oauth_provider VARCHAR(20);
ALTER TABLE users ADD COLUMN oauth_provider_id VARCHAR(255);
ALTER TABLE users ADD COLUMN avatar_url TEXT;

CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_provider_id);
