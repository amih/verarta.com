# Verarta Core Smart Contract

The `verarta.core` smart contract is the heart of the Verarta blockchain art registry. It manages artwork metadata, encrypted file uploads, quota limits, and admin key escrow.

## Features

### 1. Artwork Management
- **createart**: Register artwork with encrypted metadata (title, description, JSON metadata)
- **deleteart**: Delete artwork and all associated files/chunks

### 2. File Upload System
- **addfile**: Add file to artwork with:
  - Encrypted filename and metadata
  - Dual-encrypted DEKs (user's public key + all active admin keys)
  - AES-GCM IV and authentication tag
  - SHA256 hash for integrity verification
- **uploadchunk**: Upload encrypted file chunks (up to 256KB per chunk)
- **completefile**: Mark file upload as complete after all chunks uploaded

### 3. Quota Management (Dual-Tier: Daily + Weekly)
- **setquota**: Set user quota limits (contract owner only)
- Automatic quota enforcement on file uploads
- Automatic reset at midnight UTC (daily) and Monday 00:00 UTC (weekly)
- Default free tier: 10 files/day (25MB), 40 files/week (100MB)

### 4. Admin Key Escrow
- **addadminkey**: Register admin's X25519 public key (contract owner only)
- **rmadminkey**: Deactivate admin key (preserves audit trail)
- **logadminaccess**: Log admin access to encrypted files (audit trail)
- All files automatically encrypted with both user and admin keys

## Tables

| Table | Description |
|-------|-------------|
| `artworks` | Artwork metadata with encrypted fields |
| `artfiles` | File metadata with dual-encrypted DEKs |
| `artchunks` | Encrypted file chunks (256KB max) |
| `usagequotas` | User quota limits and usage tracking |
| `adminkeys` | Admin public keys for key escrow |
| `adminaccess` | Audit log for admin file access |

## Encryption Architecture

**Hybrid E2E Encryption:**
1. Each file encrypted with AES-256-GCM using random DEK
2. DEK encrypted with user's X25519 public key → stored in `encrypted_dek`
3. DEK also encrypted with each active admin's X25519 public key → stored in `admin_encrypted_deks[]`
4. Admin can decrypt files using their private key without user involvement
5. All admin access logged in audit trail

## Quota System

**Dual-tier quotas (daily AND weekly):**
- Daily limits reset at midnight UTC
- Weekly limits reset Monday 00:00 UTC (ISO 8601 standard)
- Weekly quota provides buffer for burst usage while controlling average
- Both limits enforced simultaneously (must satisfy both)

**Default Free Tier:**
- 10 files/day, 25 MB/day
- 40 files/week, 100 MB/week
- Ratio: 4.0x weekly-to-daily

**Premium Tier:**
- 50 files/day, 150 MB/day
- 200 files/week, 600 MB/week

## Build Instructions

### Prerequisites
- CDT (Contract Development Toolkit) 4.0.0+
- CMake 3.5+

### Compile

```bash
# From contract directory
mkdir -p build
cd build
cmake ..
make

# Output files:
# - verarta.core.wasm (compiled contract)
# - verarta.core.abi (ABI definition)
```

### Deploy

```bash
# Create contract account
cleos create account eosio verarta.core <OWNER_KEY> <ACTIVE_KEY>

# Deploy contract
cleos set contract verarta.core /path/to/build verarta.core.wasm verarta.core.abi -p verarta.core@active
```

## Usage Examples

### 1. Create Artwork

```bash
cleos push action verarta.core createart '[
  1234567890,
  "alice",
  "base64_encrypted_title",
  "base64_encrypted_description",
  "base64_encrypted_metadata",
  "user_x25519_public_key_base64"
]' -p alice@active
```

### 2. Add File with Admin Key Escrow

```bash
# Assuming 2 active admin keys in the system
cleos push action verarta.core addfile '[
  9876543210,
  1234567890,
  "alice",
  "encrypted_filename",
  "image/jpeg",
  1048576,
  "sha256_hash_hex",
  "dek_encrypted_with_user_key",
  ["dek_encrypted_with_admin1_key", "dek_encrypted_with_admin2_key"],
  "aes_gcm_iv",
  "aes_gcm_auth_tag",
  false
]' -p alice@active
```

### 3. Upload Chunk

```bash
cleos push action verarta.core uploadchunk '[
  111,
  9876543210,
  "alice",
  0,
  "base64_encrypted_chunk_data",
  262144
]' -p alice@active
```

### 4. Complete File

```bash
cleos push action verarta.core completefile '[
  9876543210,
  "alice",
  4
]' -p alice@active
```

### 5. Set User Quota

```bash
# Set premium tier quota
cleos push action verarta.core setquota '[
  "alice",
  1,
  50,
  157286400,
  200,
  629145600
]' -p verarta.core@active
```

### 6. Add Admin Key

```bash
cleos push action verarta.core addadminkey '[
  "admin1",
  "admin_x25519_public_key_base64",
  "Primary admin key for emergency access"
]' -p verarta.core@active
```

### 7. Log Admin Access

```bash
cleos push action verarta.core logadminaccess '[
  "admin1",
  9876543210,
  "User support request #12345"
]' -p admin1@active
```

## Security Considerations

1. **Private keys never on-chain**: Only public keys and encrypted data stored
2. **Dual encryption**: Files accessible by both user and admin (with audit trail)
3. **Quota enforcement**: Prevents abuse and ensures fair resource allocation
4. **Audit trail**: All admin access logged with reason and timestamp
5. **Owner verification**: All actions verify account ownership
6. **Hash verification**: SHA256 hash ensures file integrity
7. **Size limits**: 100MB max file size, 256KB max chunk size

## Integration with Backend

The backend (Astro SSR) handles:
- Client-side encryption/decryption (browser)
- WebAuthn biometric authentication
- Chunked file upload orchestration
- Transaction signing with user's private key
- Hyperion queries for file download/reassembly

The contract handles:
- Data storage and access control
- Quota enforcement
- Admin key escrow
- Audit logging

## References

- Encryption plan: `/PLAN_ENCRYPTION.md`
- File limits plan: `/PLAN_FILE_LIMITS.md`
- Backend implementation: `/backend/src/`
- Deployment guide: `/DEPLOYMENT_COMPLETE.md`
