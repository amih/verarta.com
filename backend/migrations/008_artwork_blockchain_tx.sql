-- Store the createart blockchain transaction hash for each artwork.
-- Used on the /verify/<id> public page and the Certificate of Authenticity (COA) PDF.
ALTER TABLE artwork_extras ADD COLUMN IF NOT EXISTS blockchain_tx_id VARCHAR(64);
