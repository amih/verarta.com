# End-to-End Encryption Implementation Plan for Verarta

## Executive Summary

I've analyzed the Verarta blockchain art registry codebase and designed a comprehensive end-to-end encryption system that integrates seamlessly with the existing WebAuthn authentication and chunked upload architecture. The system will use client-side asymmetric encryption (RSA-4096 or X25519) with hybrid encryption for large files, ensuring artwork images and documents are encrypted on the user's device before being uploaded to the blockchain.

## Current Architecture Analysis

### Key Findings

1. **Authentication System**: Uses WebAuthn (FIDO2) biometric authentication with public keys stored on-chain
   - WebAuthn keys are stored in device secure enclave
   - Public keys set as active permission on blockchain accounts
   - Session state in localStorage (account name, pubkey data)

2. **File Upload System**: Chunked uploads (256KB chunks) stored in blockchain history
   - Files temporarily stored on backend server during upload
   - Chunks pushed to blockchain via `uploadchunk` action
   - Final files retrieved from Hyperion by reassembling chunks
   - Hash verification (SHA256) for integrity

3. **Storage Architecture**:
   - **On-chain RAM**: Only metadata (artwork title, file info, chunk counts)
   - **Blockchain History**: Actual file chunks indexed by Hyperion
   - **No external storage**: Files live entirely in blockchain history

4. **Smart Contract**: `verarta.core` with tables:
   - `artworks` table: artwork metadata
   - `artfiles` table: file metadata (filename, mime_type, file_hash, chunk_count)
   - Actions: `createart`, `addfile`, `uploadchunk`, `deleteart`, `deletefile`

## Encryption Architecture Design

### 1. Encryption Strategy: Hybrid Asymmetric + Symmetric

**Why Hybrid?**
- Asymmetric encryption (RSA/X25519) is too slow for large files
- Solution: Encrypt file with symmetric key (AES-256-GCM), then encrypt the symmetric key with user's public key

**Key Components:**
1. **Master Encryption Key Pair** (per user)
   - Separate from WebAuthn signing keys
   - Generated on first device enrollment
   - Private key stored encrypted in browser (IndexedDB with Web Crypto API)
   - Public key stored on-chain for sharing and multi-device support

2. **Per-File Data Encryption Keys (DEK)**
   - Random AES-256-GCM key generated for each file
   - File encrypted with DEK
   - DEK encrypted with user's public encryption key
   - Encrypted DEK stored on-chain in `artfiles` table

3. **Multi-Device Support**
   - Master private key can be re-encrypted for new devices
   - New device generates temporary key pair
   - User proves ownership via WebAuthn on existing device
   - Existing device re-encrypts master key for new device

### 2. Cryptographic Library Choice

**Recommended: Web Crypto API + TweetNaCl.js**

**Web Crypto API** (browser native):
- AES-256-GCM for symmetric encryption (fast, authenticated)
- SHA-256 for hashing
- PBKDF2 for key derivation
- Secure random number generation
- Hardware-accelerated
- Keys stored in non-extractable format

**TweetNaCl.js** (for asymmetric):
- X25519 (Curve25519) for Diffie-Hellman key exchange
- Compact, audited, well-maintained
- Better performance than RSA for key sizes
- 32-byte keys (vs 4096-bit RSA)

**Alternative: @noble/ciphers + @noble/curves**
- Modern, lightweight, well-audited
- Better tree-shaking for smaller bundle
- Same algorithms (AES-256-GCM, X25519)

### 3. Encryption Flow

#### A. User Enrollment (First Device)

```
1. User registers (email + WebAuthn signing key) [EXISTING]
2. Generate master encryption key pair:
   - Generate X25519 key pair using TweetNaCl
   - Store private key encrypted in IndexedDB using Web Crypto API
   - Derive encryption password from WebAuthn credential (device-bound)
3. Store public encryption key on-chain:
   - Add new smart contract action: addencryptkey(user, pubkey)
   - Store in new table: encryptkeys (user, pubkey, device_id, created_at)
4. Display educational modal:
   "What is Encryption?
    Your files are encrypted on your device before upload.
    Only you can decrypt them with your encryption key.
    This key is protected by your fingerprint/Face ID."
```

#### B. File Upload with Encryption (with Admin Key Escrow)

```
1. User selects file in browser (EXISTING: CreateArtwork.tsx)

2. CLIENT-SIDE ENCRYPTION (NEW):
   a. Generate random DEK (256-bit AES key)
   b. Encrypt file in chunks with AES-256-GCM:
      - For each chunk: encrypt with DEK + unique nonce
      - Store encrypted chunks in memory
   c. Encrypt DEK with user's public encryption key (X25519)
   d. Fetch admin public key from blockchain
   e. Encrypt same DEK with admin's public encryption key (X25519)
   f. Calculate hash of ENCRYPTED data (not plaintext)

3. Upload metadata to backend (MODIFIED):
   POST /api/artworks/upload-start
   {
     artwork_id,
     file: encrypted_file,
     encrypted_dek_user: base64(encrypted_dek_for_user),
     encrypted_dek_admin: base64(encrypted_dek_for_admin),
     encryption_nonce: base64(nonce),
     is_encrypted: true,
     original_size: number (plaintext size for display)
   }

4. Backend saves ENCRYPTED file to temp location (EXISTING)

5. Upload encrypted chunks to blockchain (EXISTING flow)
   - Chunks already encrypted, no backend processing needed

6. Store BOTH encrypted DEKs on-chain (NEW):
   - Modify addfile action to accept encrypted_dek_user and encrypted_dek_admin
   - Store both in artfiles table
   - User can decrypt with their key
   - Admin can decrypt with admin key (for moderation/support)
```

#### C. File Retrieval and Decryption

```
1. User requests file (EXISTING):
   GET /api/artworks/files/{id}

2. Backend retrieves ENCRYPTED chunks from Hyperion (EXISTING)

3. Backend returns encrypted data + metadata:
   {
     encrypted_data: Buffer,
     encrypted_dek_user: string,    // DEK encrypted for user
     encrypted_dek_admin: string,   // DEK encrypted for admin (optional)
     encryption_nonce: string,
     is_encrypted: boolean,
     mime_type: string,
     filename: string
   }

4. CLIENT-SIDE DECRYPTION (NEW):
   a. Retrieve user's private encryption key from IndexedDB
   b. Decrypt DEK using private key (uses encrypted_dek_user)
   c. Decrypt file chunks with AES-256-GCM using decrypted DEK
   d. Verify integrity (hash check on decrypted data)
   e. Display/download decrypted file

5. ADMIN DECRYPTION (if admin viewing):
   a. Admin retrieves their private encryption key from secure storage
   b. Decrypt DEK using admin private key (uses encrypted_dek_admin)
   c. Decrypt file chunks with AES-256-GCM using decrypted DEK
   d. Display/download decrypted file
   e. Log admin access for audit trail
```

### 4. Multi-Device Key Sharing

**Scenario**: User enrolls on laptop, wants to access on phone

```
1. New device initiates enrollment:
   POST /api/encryption/request-device-enrollment
   {
     new_device_pubkey: string,
     user_email: string
   }
   Returns: enrollment_request_id

2. Existing device receives notification:
   - Display: "New device wants access to your encrypted files"
   - Show device info (browser, OS, location)
   - Require WebAuthn authentication to approve

3. If approved, existing device:
   a. Retrieves own private encryption key from IndexedDB
   b. Decrypts master private key
   c. Re-encrypts master private key with new device's public key
   d. Submits encrypted key bundle to blockchain:
      POST /api/encryption/approve-device
      {
        enrollment_request_id,
        encrypted_key_for_new_device: string,
        signature: webauthn_signature
      }

4. New device retrieves encrypted key bundle:
   GET /api/encryption/get-device-key/{enrollment_request_id}
   - Decrypt with own private key
   - Store in IndexedDB
   - Can now decrypt all user files
```

### 5. Admin Key Escrow (Platform Access)

**Purpose**: Allow platform administrators to decrypt files for content moderation, legal compliance, and user support.

**How It Works:**
- Platform has a single master admin encryption key pair
- Admin public key stored on-chain (readable by all)
- Admin private key stored securely (HSM or secure key management system)
- Every encrypted file has DEK encrypted with BOTH user key AND admin key
- Admin can decrypt any file using their private key
- All admin decryptions are logged for audit trail

**Admin Key Management:**

```
1. Initial Setup (one-time, during deployment):
   - Generate admin X25519 key pair on secure system
   - Store admin public key on-chain via smart contract action
   - Store admin private key in Hardware Security Module (HSM) or secure vault
   - Require multi-signature approval for admin key usage

2. Admin Key Storage:
   - Private key NEVER leaves HSM/secure environment
   - Decryption happens server-side in isolated environment
   - Multi-factor authentication required for admin access
   - All operations logged with timestamp, admin ID, file ID

3. Admin Key Rotation (annual or as needed):
   - Generate new admin key pair
   - Background job re-encrypts all file DEKs with new admin key
   - Old admin key archived but not deleted (for historical files)
   - Rotation logged on blockchain for transparency
```

**Use Cases:**
1. **Content Moderation**: Review flagged content for policy violations
2. **Legal Compliance**: Respond to valid legal requests (DMCA, court orders)
3. **User Support**: Assist users who lost access to their files
4. **Platform Security**: Detect and remove malicious content
5. **Emergency Access**: Recover files in critical situations

**Admin Decryption Flow:**

```
1. Admin requests file access:
   POST /api/admin/decrypt-file
   {
     file_id: number,
     reason: string,  // "content_moderation", "legal_request", "user_support"
     ticket_id: string  // reference to support ticket or legal case
   }
   - Requires admin authentication + 2FA
   - Logs request with reason

2. Backend retrieves file metadata from blockchain:
   - Get encrypted_dek_admin from artfiles table
   - Get encrypted chunks from Hyperion

3. Backend calls HSM/secure service:
   POST https://secure-hsm.internal/decrypt-dek
   {
     encrypted_dek_admin: string,
     file_id: number,
     admin_id: string,
     reason: string
   }
   - HSM verifies admin permissions
   - HSM decrypts DEK using admin private key
   - Returns decrypted DEK (never exposes private key)

4. Backend decrypts file:
   - Use decrypted DEK to decrypt file chunks
   - Assemble complete file
   - Return to admin interface

5. Audit log entry created:
   - Timestamp
   - Admin user ID
   - File ID and owner
   - Reason for access
   - IP address
   - Result (success/failure)
```

**Security Considerations:**

- **Transparency**: All admin decryptions logged on blockchain (optional: public audit trail)
- **Access Control**: Admin key usage requires multiple signatures
- **Rate Limiting**: Admins can only decrypt limited number of files per day
- **Notification**: Users notified when admin accesses their files (unless legal hold prevents it)
- **Key Rotation**: Admin keys rotated annually
- **Audit Trail**: Immutable log of all admin access
- **Legal Framework**: Admin access policy documented and legally reviewed

**Privacy vs. Moderation Balance:**
- Users informed during signup that admin escrow exists
- Transparency report published quarterly (number of admin accesses)
- Admin access only used for legitimate purposes
- Users can download audit log of admin access to their files

### 6. Social Recovery System (User Key Recovery)

**Implementation of TODO #1**: "2 out of friends and family can help reset"

```
1. User designates recovery guardians:
   POST /api/encryption/add-guardian
   {
     guardian_account: string (blockchain account)
   }
   - Split master key using Shamir's Secret Sharing (2-of-N threshold)
   - Encrypt each share with guardian's public key
   - Store encrypted shares on-chain

2. Recovery process:
   a. User loses access to all devices
   b. User creates new account (new WebAuthn key)
   c. User requests recovery:
      POST /api/encryption/request-recovery
      {
        old_account: string,
        new_account: string,
        new_encryption_pubkey: string
      }
   d. System notifies guardians (email + on-chain notification)
   e. 2+ guardians approve via WebAuthn signature
   f. Smart contract verifies signatures, reconstructs key
   g. Re-encrypts master key for new account
   h. User regains access to encrypted files
```

### 7. Smart Contract Modifications

#### New Table: `adminkeys`

```cpp
struct [[eosio::table]] adminkey {
  uint64_t      id;              // primary key
  std::string   pubkey;          // Admin X25519 public key (base64)
  uint64_t      created_at;      // timestamp
  uint64_t      expires_at;      // expiry for key rotation
  bool          is_active;       // current active key
  std::string   key_version;     // e.g., "v1", "v2" for rotation tracking

  uint64_t primary_key() const { return id; }
};

typedef eosio::multi_index<"adminkeys"_n, adminkey> adminkeys_table;
```

#### New Table: `encryptkeys`

```cpp
struct [[eosio::table]] encryptkey {
  uint64_t      id;              // primary key
  name          owner;           // account name
  std::string   pubkey;          // X25519 public key (base64)
  std::string   device_id;       // device identifier
  uint64_t      created_at;      // timestamp
  bool          is_active;       // can be revoked

  uint64_t primary_key() const { return id; }
  uint64_t by_owner() const { return owner.value; }
};
```

#### New Table: `guardians`

```cpp
struct [[eosio::table]] guardian {
  uint64_t      id;
  name          owner;           // account with guardians
  name          guardian_account; // guardian's account
  std::string   encrypted_share; // encrypted key share
  bool          is_active;
  uint64_t      added_at;

  uint64_t primary_key() const { return id; }
  uint64_t by_owner() const { return owner.value; }
};
```

#### Modified Table: `artfiles`

```cpp
struct [[eosio::table]] artfile {
  // ... existing fields ...

  // NEW FIELDS:
  bool          is_encrypted;         // true if file is encrypted
  std::string   encrypted_dek_user;   // DEK encrypted for user
  std::string   encrypted_dek_admin;  // DEK encrypted for admin (key escrow)
  std::string   encryption_nonce;     // nonce for decryption
  uint64_t      plaintext_size;       // original unencrypted size
  std::string   encryption_algo;      // "AES-256-GCM+X25519"
  std::string   admin_key_version;    // which admin key was used (for rotation)

  // existing fields
  uint64_t      id;
  uint64_t      artwork_id;
  name          owner;
  std::string   filename;
  std::string   mime_type;
  uint64_t      file_size;        // encrypted size
  std::string   file_hash;        // hash of ENCRYPTED data
  uint32_t      chunk_count;
  uint32_t      uploaded_chunks;
  bool          upload_complete;
  uint64_t      created_at;
  bool          is_thumbnail;
};
```

#### New Actions

```cpp
// Admin key management (contract authority only)
ACTION setadminkey(
  std::string pubkey,
  std::string key_version,
  uint64_t expires_at
);

ACTION revokeadminkey(
  uint64_t key_id
);

// User encryption keys
ACTION addencryptkey(
  name owner,
  std::string pubkey,
  std::string device_id
);

ACTION revokekey(
  name owner,
  uint64_t key_id
);

// Guardian recovery
ACTION addguardian(
  name owner,
  name guardian_account,
  std::string encrypted_share
);

ACTION removeguardian(
  name owner,
  uint64_t guardian_id
);

ACTION recoverkey(
  name old_owner,
  name new_owner,
  std::string new_pubkey,
  std::vector<std::string> guardian_signatures
);
```

#### Modified Actions

```cpp
// Modified to accept encryption metadata with admin escrow
ACTION addfile(
  name owner,
  uint64_t artwork_id,
  string filename,
  string mime_type,
  uint64_t file_size,             // encrypted size
  string file_hash,               // hash of encrypted data
  uint32_t chunk_count,
  bool is_thumbnail,
  // NEW PARAMETERS:
  bool is_encrypted,
  string encrypted_dek_user,      // DEK encrypted for user
  string encrypted_dek_admin,     // DEK encrypted for admin (empty if not encrypted)
  string encryption_nonce,
  uint64_t plaintext_size,        // 0 if not encrypted
  string encryption_algo,
  string admin_key_version        // which admin key was used
);
```

#### New Table: `admin_access_log`

```cpp
struct [[eosio::table]] adminaccess {
  uint64_t      id;              // primary key
  uint64_t      file_id;         // file that was accessed
  name          file_owner;      // owner of the file
  name          admin_account;   // admin who accessed
  std::string   reason;          // "moderation", "legal", "support"
  std::string   ticket_id;       // reference ID
  uint64_t      accessed_at;     // timestamp

  uint64_t primary_key() const { return id; }
  uint64_t by_file() const { return file_id; }
  uint64_t by_admin() const { return admin_account.value; }
  uint64_t by_owner() const { return file_owner.value; }
};

typedef eosio::multi_index<
  "adminaccess"_n,
  adminaccess,
  indexed_by<"byfile"_n, const_mem_fun<adminaccess, uint64_t, &adminaccess::by_file>>,
  indexed_by<"byadmin"_n, const_mem_fun<adminaccess, uint64_t, &adminaccess::by_admin>>,
  indexed_by<"byowner"_n, const_mem_fun<adminaccess, uint64_t, &adminaccess::by_owner>>
> adminaccess_table;
```

#### New Action: Log Admin Access

```cpp
ACTION logadminaccess(
  uint64_t file_id,
  name file_owner,
  name admin_account,
  std::string reason,
  std::string ticket_id
) {
  require_auth(admin_account);

  // Verify admin_account has admin permissions
  // (check against admin accounts table)

  adminaccess_table logs(get_self(), get_self().value);
  logs.emplace(admin_account, [&](auto& row) {
    row.id = logs.available_primary_key();
    row.file_id = file_id;
    row.file_owner = file_owner;
    row.admin_account = admin_account;
    row.reason = reason;
    row.ticket_id = ticket_id;
    row.accessed_at = current_time_point().sec_since_epoch();
  });
}
```

### 8. Frontend Implementation

#### New Files to Create

1. **frontend/src/lib/encryption.ts**
   - Core encryption/decryption functions
   - Key generation and management
   - Web Crypto API wrappers
   - TweetNaCl integration

2. **frontend/src/lib/keystore.ts**
   - IndexedDB management for private keys
   - Key derivation from WebAuthn
   - Secure key storage/retrieval

3. **frontend/src/hooks/useEncryption.ts**
   - React hook for encryption operations
   - Key pair management
   - Multi-device enrollment status

4. **frontend/src/hooks/useGuardians.ts**
   - Guardian management
   - Recovery process

5. **frontend/src/components/encryption/**
   - `EncryptionSetup.tsx` - Initial key generation wizard
   - `EncryptionExplainer.tsx` - Educational modal about asymmetric encryption
   - `DeviceManager.tsx` - List and manage enrolled devices
   - `GuardianSetup.tsx` - Add/remove recovery guardians
   - `RecoveryFlow.tsx` - Key recovery interface

#### Modified Files

1. **frontend/src/components/artworks/CreateArtwork.tsx**
   - Add encryption checkbox (default: ON)
   - Encrypt files before upload
   - Show encryption status in UI

2. **frontend/src/components/artworks/FileUpload.tsx**
   - Integrate encryption during upload
   - Show "Encrypting..." progress

3. **frontend/src/components/artworks/ArtworkDetail.tsx**
   - Decrypt files on retrieval
   - Show lock icon for encrypted files
   - Handle decryption errors gracefully

4. **frontend/src/hooks/useCreateArtwork.ts**
   - Modify upload flow to include encryption
   - Pass encrypted DEK to backend

### 8. Backend Implementation

#### Modified Files

1. **backend/src/pages/api/artworks/upload-start.ts**
   - Accept `encrypted_dek`, `encryption_nonce`, `is_encrypted` fields
   - Store encryption metadata in database
   - No backend decryption (zero-knowledge)

2. **backend/src/pages/api/artworks/files/[id].ts**
   - Return encryption metadata with file
   - Return encrypted data as-is
   - Client handles decryption

#### New Files

1. **backend/src/pages/api/encryption/setup.ts**
   - Store user's public encryption key
   - Call smart contract `addencryptkey` action

2. **backend/src/pages/api/encryption/devices.ts**
   - List user's enrolled devices
   - Request device enrollment
   - Approve device enrollment

3. **backend/src/pages/api/encryption/guardians.ts**
   - Add/remove guardians
   - Request recovery
   - Approve recovery (for guardians)

4. **backend/src/lib/encryption-helpers.ts**
   - Helper functions for encryption operations
   - Smart contract interaction wrappers

### 9. Database Schema Changes

```sql
-- Add encryption metadata to file_uploads table
ALTER TABLE file_uploads ADD COLUMN is_encrypted BOOLEAN DEFAULT FALSE;
ALTER TABLE file_uploads ADD COLUMN encrypted_dek TEXT;
ALTER TABLE file_uploads ADD COLUMN encryption_nonce TEXT;
ALTER TABLE file_uploads ADD COLUMN plaintext_size BIGINT;

-- New table: device_enrollment_requests
CREATE TABLE device_enrollment_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  new_device_pubkey TEXT NOT NULL,
  existing_device_approval TEXT,  -- encrypted key bundle
  status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  approved_at TIMESTAMP
);

-- New table: user_encryption_keys (cache of on-chain data)
CREATE TABLE user_encryption_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  blockchain_key_id BIGINT NOT NULL,
  pubkey TEXT NOT NULL,
  device_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_encryption_keys_user_id ON user_encryption_keys(user_id);
```

### 10. Educational UI Component

As per TODO requirement: "add short explanation on asymmetric encryption"

**Component: EncryptionExplainer.tsx**

```typescript
// Modal shown on first encryption setup
<Modal>
  <h2>Your Files Are Protected with Encryption</h2>

  <section>
    <h3>What is Encryption?</h3>
    <p>
      Encryption scrambles your files so only you can read them.
      Think of it like a lockbox - your fingerprint is the key.
    </p>
  </section>

  <section>
    <h3>How It Works</h3>
    <div>
      1️⃣ <strong>On Your Device</strong>: Files are encrypted before upload
      2️⃣ <strong>On the Blockchain</strong>: Only encrypted data is stored
      3️⃣ <strong>When You View</strong>: Your device decrypts the files
    </div>
  </section>

  <section>
    <h3>Asymmetric Encryption</h3>
    <p>
      You have two keys: a <strong>public key</strong> (like your address)
      and a <strong>private key</strong> (like your house key).
    </p>
    <ul>
      <li>Public key: Safe to share, used to encrypt files</li>
      <li>Private key: Secret, stays on your device, unlocks your files</li>
    </ul>
  </section>

  <InfoBox>
    🔒 Your private key never leaves your device
    ✅ Protected by your fingerprint/Face ID
    🌐 Files encrypted on blockchain cannot be read by anyone else
  </InfoBox>
</Modal>
```

### 11. Security Considerations

#### Key Storage
- **Private keys never leave device** except during multi-device enrollment
- **IndexedDB** used for browser storage (can't be accessed by other domains)
- **Web Crypto API non-extractable keys** when possible
- **Derived encryption** from WebAuthn credential (device-bound)

#### Zero-Knowledge Backend
- Backend never sees plaintext files
- Backend never sees private encryption keys
- Backend only handles encrypted data and metadata

#### Attack Vectors & Mitigations
1. **XSS Attack**: Could steal keys from IndexedDB
   - Mitigation: CSP headers, input sanitization, regular audits

2. **Man-in-the-Middle**: Could intercept keys during device enrollment
   - Mitigation: HTTPS only, certificate pinning, verify device fingerprints

3. **Lost Device**: User loses access to private key
   - Mitigation: Social recovery with guardians, multi-device enrollment

4. **Malicious Guardian**: Guardian colludes to steal key
   - Mitigation: Shamir's Secret Sharing (2-of-N threshold), audit trail

### 12. Performance Considerations

#### File Size Limits
- **AES-256-GCM encryption overhead**: ~16 bytes per chunk (authentication tag)
- **256KB chunk** → ~256.016KB encrypted chunk (negligible)
- **No size limit change needed**

#### Encryption Speed
- **Web Crypto API**: Hardware-accelerated, ~100-500 MB/s
- **10MB file**: ~20ms to encrypt on modern hardware
- **100MB file**: ~200ms to encrypt
- **Negligible user impact** with progress indicator

#### Browser Compatibility
- **Web Crypto API**: All modern browsers (Chrome 37+, Firefox 34+, Safari 11+)
- **IndexedDB**: Universal support
- **TweetNaCl.js**: Pure JavaScript, works everywhere

### 13. Optional Features (Future Enhancements)

1. **Encrypted Thumbnails**
   - Generate thumbnail on client
   - Encrypt thumbnail separately with same DEK
   - Decrypt for gallery view

2. **Shared Artworks**
   - Re-encrypt DEK with recipient's public key
   - Store multiple encrypted DEKs per file
   - Granular sharing permissions

3. **Encrypted Metadata**
   - Encrypt artwork title and description
   - Searchable encryption (advanced)

4. **Key Rotation**
   - Periodic key rotation for enhanced security
   - Re-encrypt files with new keys

5. **Encryption Analytics**
   - Track which files are encrypted
   - Show encryption adoption rate
   - Security posture dashboard

## Step-by-Step Implementation Plan

### Phase 1: Smart Contract Foundation (Week 1)

1. **Modify verarta.core contract**
   - Add `encryptkeys` table
   - Add `guardians` table
   - Modify `artfiles` table structure
   - Implement new actions: `addencryptkey`, `revokekey`, `addguardian`, `removeguardian`, `recoverkey`
   - Modify `addfile` action signature
   - Update secondary indices

2. **Compile and deploy**
   - Test actions with cleos
   - Verify table structures
   - Test encryption metadata storage

### Phase 2: Frontend Encryption Library (Week 2)

1. **Create crypto primitives** (`frontend/src/lib/encryption.ts`)
   - Key pair generation (X25519)
   - AES-256-GCM encryption/decryption
   - DEK generation
   - Nonce generation
   - Hash calculation

2. **Create keystore** (`frontend/src/lib/keystore.ts`)
   - IndexedDB setup
   - Key storage/retrieval
   - Key derivation from WebAuthn
   - Device fingerprinting

3. **Write unit tests**
   - Test encryption/decryption roundtrip
   - Test key generation
   - Test keystore operations

### Phase 3: Frontend UI Components (Week 2-3)

1. **Encryption setup flow**
   - `EncryptionSetup.tsx` - Wizard for first-time setup
   - `EncryptionExplainer.tsx` - Educational modal
   - Integration with account creation flow

2. **File upload modifications**
   - Modify `CreateArtwork.tsx` to encrypt before upload
   - Modify `FileUpload.tsx` to show encryption progress
   - Add encryption toggle (default ON)

3. **File retrieval modifications**
   - Modify `ArtworkDetail.tsx` to decrypt on retrieval
   - Add decryption loading state
   - Handle decryption errors

4. **Device management**
   - `DeviceManager.tsx` - List enrolled devices
   - Device enrollment request flow
   - Device approval flow

5. **Guardian management** (if implementing social recovery)
   - `GuardianSetup.tsx` - Add/remove guardians
   - `RecoveryFlow.tsx` - Key recovery interface

### Phase 4: Backend API Updates (Week 3)

1. **Modify upload endpoints**
   - Update `/api/artworks/upload-start` to accept encryption metadata
   - Update database schema
   - Pass encryption metadata to smart contract

2. **Modify retrieval endpoints**
   - Update `/api/artworks/files/[id]` to return encryption metadata
   - No decryption on backend

3. **Create encryption management endpoints**
   - `/api/encryption/setup` - Store public key
   - `/api/encryption/devices` - Device management
   - `/api/encryption/guardians` - Guardian management (if implementing)

4. **Database migrations**
   - Run SQL migrations for new tables and columns

### Phase 5: Integration & Testing (Week 4)

1. **End-to-end testing**
   - Create account → Setup encryption → Upload encrypted file → Retrieve and decrypt
   - Test multi-device enrollment flow
   - Test guardian recovery flow (if implemented)
   - Test unencrypted files still work (backward compatibility)

2. **Error handling**
   - Test decryption failure scenarios
   - Test lost key scenarios
   - Test network failures during encryption

3. **Performance testing**
   - Test 100MB file encryption/decryption
   - Measure browser memory usage
   - Test on mobile devices

4. **Security audit**
   - Review key storage implementation
   - Review encryption algorithms
   - Test for key leakage
   - Verify zero-knowledge backend

### Phase 6: Documentation & Deployment (Week 4)

1. **Documentation**
   - Update README with encryption features
   - Create encryption setup guide
   - Document key recovery process
   - API documentation updates

2. **Deployment**
   - Deploy updated smart contract
   - Deploy backend updates
   - Deploy frontend updates
   - Run database migrations

3. **User education**
   - Create help center articles
   - Video tutorial on encryption
   - FAQ about encryption

## Risk Mitigation

### Technical Risks

1. **Browser compatibility issues**
   - Mitigation: Polyfills for older browsers, graceful degradation

2. **Performance on low-end devices**
   - Mitigation: Web Workers for encryption, chunked processing, progress indicators

3. **IndexedDB quota limits**
   - Mitigation: Clear old keys, compress key data, warn users

### User Experience Risks

1. **Lost access due to device loss**
   - Mitigation: Multi-device enrollment, guardian recovery, prominent warnings

2. **User confusion about encryption**
   - Mitigation: Educational modals, tooltips, help documentation

3. **Slower upload times**
   - Mitigation: Optimize encryption, show progress, explain why it's worth it

### Operational Risks

1. **Migration of existing unencrypted files**
   - Mitigation: Support both encrypted and unencrypted files, optional re-encryption

2. **Key recovery failures**
   - Mitigation: Thorough testing, backup recovery methods, customer support

## Critical Files for Implementation

Here are the most critical files that need to be created or modified:

- **blockchain/contracts/verarta.core/verarta.core.cpp** - Add encryption key management tables and actions, modify artfiles table structure
- **blockchain/contracts/verarta.core/verarta.core.hpp** - Define new table structures (encryptkeys, guardians) and action signatures
- **frontend/src/lib/encryption.ts** - Core encryption/decryption library using Web Crypto API and TweetNaCl.js for all cryptographic operations
- **frontend/src/lib/keystore.ts** - IndexedDB-based secure key storage and retrieval system
- **frontend/src/components/artworks/CreateArtwork.tsx** - Integrate client-side encryption into upload flow with encryption toggle and progress indicator
