-- Verarta Backend Database Schema
-- Initial migration

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  blockchain_account VARCHAR(12) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  webauthn_credential_id TEXT,
  webauthn_public_key TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  email_verified BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_blockchain_account ON users(blockchain_account);

-- Email verification codes
CREATE TABLE email_verifications (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  verification_code VARCHAR(6) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  blockchain_account VARCHAR(12) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_verifications_email ON email_verifications(email);

-- Sessions (hybrid: JWT + database for revocation)
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- File upload tracking
CREATE TABLE file_uploads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  upload_id VARCHAR(36) UNIQUE NOT NULL,
  blockchain_artwork_id BIGINT,
  blockchain_file_id BIGINT,
  temp_file_path VARCHAR(500) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  file_hash VARCHAR(64) NOT NULL,
  chunk_size INTEGER NOT NULL DEFAULT 262144,
  total_chunks INTEGER NOT NULL,
  uploaded_chunks INTEGER DEFAULT 0,
  is_thumbnail BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_file_uploads_user_id ON file_uploads(user_id);
CREATE INDEX idx_file_uploads_upload_id ON file_uploads(upload_id);

-- Chunk upload tracking
CREATE TABLE chunk_uploads (
  id SERIAL PRIMARY KEY,
  file_upload_id INTEGER REFERENCES file_uploads(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  blockchain_tx_id VARCHAR(64),
  uploaded_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(file_upload_id, chunk_index)
);

CREATE INDEX idx_chunk_uploads_file_upload_id ON chunk_uploads(file_upload_id);
