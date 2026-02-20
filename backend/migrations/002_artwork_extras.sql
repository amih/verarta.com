CREATE TABLE artists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE collections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE artwork_extras (
  id SERIAL PRIMARY KEY,
  blockchain_artwork_id BIGINT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  description_html TEXT,
  creation_date VARCHAR(100),
  era VARCHAR(100),
  artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
  collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(blockchain_artwork_id, user_id)
);
CREATE INDEX idx_artwork_extras_user ON artwork_extras(user_id);
CREATE INDEX idx_artwork_extras_collection ON artwork_extras(collection_id);
CREATE INDEX idx_artwork_extras_artist ON artwork_extras(artist_id);
