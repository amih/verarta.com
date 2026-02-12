# Verarta Frontend Implementation Plan

## Context

The Verarta backend and smart contract are fully operational. This plan implements a Next.js 14 frontend with WebAuthn biometric authentication, client-side encryption, and chunked file uploads to the blockchain.

**Why**: Enable users to interact with the Verarta art registry through a modern web interface without browser extensions or wallet plugins.

**Current State**:
- ✅ Backend API operational (32 endpoints)
- ✅ Smart contract deployed (verarta.core)
- ✅ Database and blockchain running
- ❌ No frontend - starting from scratch

---

## Architecture Overview

```
Browser → Next.js SSR → Backend API → PostgreSQL/Redis
        ↓                          ↓
    WebAuthn                   Blockchain
    Client Crypto              (verarta.core)
    IndexedDB
```

**Key Features**:
1. WebAuthn biometric authentication (no passwords)
2. Client-side X25519 + AES-256-GCM encryption
3. Chunked file uploads with progress tracking
4. Dual-tier quota display (daily + weekly)
5. Server-side rendering for SEO

---

## Technology Stack

**Framework**: Next.js 14 (App Router)
**Language**: TypeScript
**Styling**: Tailwind CSS + shadcn/ui
**State**: Zustand + React Query
**Encryption**: libsodium.js (X25519 + ChaCha20-Poly1305)
**WebAuthn**: @simplewebauthn/browser
**Forms**: React Hook Form + Zod validation
**HTTP**: Axios with interceptors

---

## Implementation Phases

### Phase 1: Project Setup (1-2 hours)

**Create Next.js project:**
```bash
cd /home/ami/dev/work/verarta.com
npx create-next-app@latest frontend \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"
```

**Install dependencies:**
```bash
cd frontend
npm install \
  @simplewebauthn/browser \
  libsodium-wrappers \
  axios \
  zustand \
  @tanstack/react-query \
  react-hook-form \
  @hookform/resolvers \
  zod \
  lucide-react \
  clsx \
  tailwind-merge

npm install -D @types/libsodium-wrappers
```

**shadcn/ui components:**
```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button input card form toast progress dialog
```

**Environment variables (.env.local):**
```env
NEXT_PUBLIC_API_URL=http://localhost:4321
NEXT_PUBLIC_CHAIN_ID=96f99757daf05efb9ed0f8bb675e643e4954a5b6c4c017a25a184ea27f0394cc
NEXT_PUBLIC_CONTRACT_ACCOUNT=verarta.core
```

---

### Phase 2: Core Infrastructure (2-3 hours)

**File structure:**
```
frontend/src/
├── app/
│   ├── layout.tsx                 # Root layout
│   ├── page.tsx                   # Landing page
│   ├── auth/
│   │   ├── register/page.tsx      # Registration
│   │   ├── verify/page.tsx        # Email verification
│   │   └── login/page.tsx         # Login
│   ├── dashboard/
│   │   ├── layout.tsx             # Dashboard layout
│   │   ├── page.tsx               # Dashboard home
│   │   ├── upload/page.tsx        # Upload artwork
│   │   └── artworks/[id]/page.tsx # Artwork detail
│   └── api/                       # API routes (if needed)
├── components/
│   ├── ui/                        # shadcn components
│   ├── auth/
│   │   ├── RegisterForm.tsx
│   │   ├── VerifyEmailForm.tsx
│   │   └── LoginForm.tsx
│   ├── artwork/
│   │   ├── ArtworkCard.tsx
│   │   ├── ArtworkGrid.tsx
│   │   ├── UploadForm.tsx
│   │   └── QuotaDisplay.tsx
│   └── layout/
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Footer.tsx
├── lib/
│   ├── api/
│   │   ├── client.ts              # Axios instance
│   │   ├── auth.ts                # Auth API calls
│   │   ├── artworks.ts            # Artwork API calls
│   │   └── chain.ts               # Blockchain API calls
│   ├── crypto/
│   │   ├── keys.ts                # Key generation/storage
│   │   ├── encryption.ts          # File encryption
│   │   └── webauthn.ts            # WebAuthn helpers
│   ├── blockchain/
│   │   ├── transaction.ts         # Transaction signing
│   │   └── serialization.ts       # EOSIO serialization
│   ├── storage/
│   │   ├── indexeddb.ts           # Key storage
│   │   └── session.ts             # Session management
│   └── utils/
│       ├── chunking.ts            # File chunking
│       ├── validation.ts          # Zod schemas
│       └── cn.ts                  # Tailwind merge
├── store/
│   ├── auth.ts                    # Auth state (Zustand)
│   ├── artworks.ts                # Artworks state
│   └── upload.ts                  # Upload progress state
└── types/
    ├── api.ts                     # API response types
    ├── artwork.ts                 # Artwork types
    └── user.ts                    # User types
```

**API Client (`lib/api/client.ts`):**
```typescript
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // For cookies
});

// Request interceptor for auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  }
);
```

---

### Phase 3: Authentication System (4-5 hours)

**WebAuthn Helper (`lib/crypto/webauthn.ts`):**
```typescript
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export async function registerWithWebAuthn(email: string, displayName: string) {
  // 1. Get registration options from backend
  // 2. Start WebAuthn registration
  // 3. Send credential to backend
  // 4. Return blockchain account name
}

export async function authenticateWithWebAuthn(email: string) {
  // 1. Get authentication options from backend
  // 2. Start WebAuthn authentication
  // 3. Send assertion to backend
  // 4. Store session token
}
```

**Key Generation (`lib/crypto/keys.ts`):**
```typescript
import sodium from 'libsodium-wrappers';

export async function generateKeyPair() {
  await sodium.ready;
  const keyPair = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(keyPair.publicKey),
    privateKey: sodium.to_base64(keyPair.privateKey),
  };
}

export async function storePrivateKey(privateKey: string, userPin: string) {
  // Encrypt private key with user PIN
  // Store in IndexedDB
}

export async function getPrivateKey(userPin: string) {
  // Retrieve and decrypt private key from IndexedDB
}
```

**Auth Store (`store/auth.ts`):**
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (user, token) => {
        localStorage.setItem('auth_token', token);
        set({ user, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('auth_token');
        set({ user: null, isAuthenticated: false });
      },
    }),
    { name: 'auth-storage' }
  )
);
```

**Registration Flow:**
1. User enters email + display name
2. Frontend generates X25519 key pair
3. Frontend registers WebAuthn credential
4. Frontend calls `/api/auth/register` → receives blockchain account
5. User verifies email with code (or 414155 in DEV_MODE)
6. Frontend calls `/api/auth/create-account` with WebAuthn credential + public key
7. Private key stored encrypted in IndexedDB
8. Redirect to dashboard

**Login Flow:**
1. User enters email
2. Frontend authenticates with WebAuthn
3. Frontend retrieves private key from IndexedDB (with user PIN)
4. User logged in → redirect to dashboard

---

### Phase 4: File Encryption System (3-4 hours)

**File Encryption (`lib/crypto/encryption.ts`):**
```typescript
import sodium from 'libsodium-wrappers';

export async function encryptFile(
  fileBuffer: ArrayBuffer,
  recipientPublicKeys: string[] // [userPublicKey, ...adminPublicKeys]
) {
  await sodium.ready;

  // 1. Generate random DEK (Data Encryption Key)
  const dek = sodium.randombytes_buf(32);

  // 2. Generate random nonce (IV)
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_chacha20poly1305_ietf_NPUBBYTES);

  // 3. Encrypt file with DEK using ChaCha20-Poly1305
  const ciphertext = sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
    new Uint8Array(fileBuffer),
    null, // No additional data
    null, // No secret nonce
    nonce,
    dek
  );

  // 4. Encrypt DEK with each recipient's public key
  const encryptedDeks = recipientPublicKeys.map(pubKey => {
    const pubKeyBytes = sodium.from_base64(pubKey);
    const ephemeralKeyPair = sodium.crypto_box_keypair();
    const encryptedDek = sodium.crypto_box_easy(
      dek,
      nonce,
      pubKeyBytes,
      ephemeralKeyPair.privateKey
    );
    return {
      encryptedDek: sodium.to_base64(encryptedDek),
      ephemeralPublicKey: sodium.to_base64(ephemeralKeyPair.publicKey),
    };
  });

  // 5. Calculate SHA256 hash
  const hash = sodium.crypto_hash_sha256(new Uint8Array(fileBuffer));

  return {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
    encryptedDeks,
    hash: sodium.to_hex(hash),
  };
}

export async function decryptFile(
  ciphertextBase64: string,
  nonceBase64: string,
  encryptedDekBase64: string,
  ephemeralPublicKeyBase64: string,
  userPrivateKeyBase64: string
) {
  await sodium.ready;

  // 1. Decrypt DEK with user's private key
  const ciphertext = sodium.from_base64(ciphertextBase64);
  const nonce = sodium.from_base64(nonceBase64);
  const encryptedDek = sodium.from_base64(encryptedDekBase64);
  const ephemeralPublicKey = sodium.from_base64(ephemeralPublicKeyBase64);
  const userPrivateKey = sodium.from_base64(userPrivateKeyBase64);

  const dek = sodium.crypto_box_open_easy(
    encryptedDek,
    nonce,
    ephemeralPublicKey,
    userPrivateKey
  );

  // 2. Decrypt file with DEK
  const plaintext = sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
    null, // No secret nonce
    ciphertext,
    null, // No additional data
    nonce,
    dek
  );

  return plaintext.buffer;
}
```

**File Chunking (`lib/utils/chunking.ts`):**
```typescript
const CHUNK_SIZE = 256 * 1024; // 256 KB

export function chunkFile(file: File): Promise<Blob[]> {
  return new Promise((resolve) => {
    const chunks: Blob[] = [];
    let offset = 0;

    while (offset < file.size) {
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      chunks.push(chunk);
      offset += CHUNK_SIZE;
    }

    resolve(chunks);
  });
}

export function calculateTotalChunks(fileSize: number): number {
  return Math.ceil(fileSize / CHUNK_SIZE);
}
```

---

### Phase 5: Upload System (4-5 hours)

**Upload Store (`store/upload.ts`):**
```typescript
import { create } from 'zustand';

interface UploadState {
  uploads: Map<string, UploadProgress>;
  startUpload: (uploadId: string, totalChunks: number) => void;
  updateProgress: (uploadId: string, uploadedChunks: number) => void;
  completeUpload: (uploadId: string) => void;
  cancelUpload: (uploadId: string) => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  uploads: new Map(),
  startUpload: (uploadId, totalChunks) =>
    set((state) => {
      state.uploads.set(uploadId, { uploadedChunks: 0, totalChunks, status: 'uploading' });
      return { uploads: new Map(state.uploads) };
    }),
  // ... other methods
}));
```

**Upload Flow:**
```typescript
export async function uploadArtwork(
  file: File,
  metadata: ArtworkMetadata,
  userPublicKey: string,
  userPrivateKey: string,
  adminPublicKeys: string[]
) {
  // 1. Read file as ArrayBuffer
  const fileBuffer = await file.arrayBuffer();

  // 2. Encrypt file
  const encrypted = await encryptFile(fileBuffer, [userPublicKey, ...adminPublicKeys]);

  // 3. Initialize upload
  const { uploadId, totalChunks } = await apiClient.post('/api/artworks/upload-init', {
    title: metadata.title,
    filename: file.name,
    mimeType: file.type,
    fileSize: file.size,
    fileHash: encrypted.hash,
    encryptedDek: encrypted.encryptedDeks[0].encryptedDek,
    adminEncryptedDeks: encrypted.encryptedDeks.slice(1),
    iv: encrypted.nonce,
    authTag: '', // ChaCha20-Poly1305 includes auth tag in ciphertext
  });

  // 4. Chunk encrypted file
  const chunks = await chunkFile(new Blob([encrypted.ciphertext]));

  // 5. Upload chunks
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkData = await blobToBase64(chunk);

    // Sign transaction with WebAuthn
    const transaction = createChunkUploadTransaction(uploadId, i, chunkData);
    const signedTransaction = await signTransaction(transaction, userPrivateKey);

    await apiClient.post('/api/artworks/upload-chunk', {
      uploadId,
      chunkIndex: i,
      signedTransaction,
    });

    // Update progress
    useUploadStore.getState().updateProgress(uploadId, i + 1);
  }

  // 6. Complete upload
  await apiClient.post('/api/artworks/upload-complete', { uploadId });
  useUploadStore.getState().completeUpload(uploadId);
}
```

---

### Phase 6: UI Components (5-6 hours)

**Registration Form (`components/auth/RegisterForm.tsx`):**
- Email input (validated)
- Display name input
- "Create Account" button
- WebAuthn registration on submit
- Redirect to verification page

**Upload Form (`components/artwork/UploadForm.tsx`):**
- Drag-and-drop file input
- Title, description, tags inputs
- Thumbnail preview
- Progress bar with chunk count
- Quota usage display
- "Upload" button (disabled if quota exceeded)

**Artwork Grid (`components/artwork/ArtworkGrid.tsx`):**
- Masonry grid layout
- Artwork cards with thumbnails
- Title, date, file count
- Click to view details
- Infinite scroll with React Query

**Quota Display (`components/artwork/QuotaDisplay.tsx`):**
- Daily quota: "8/10 files, 20/25 MB"
- Weekly quota: "25/40 files, 75/100 MB"
- Progress bars
- Upgrade button (if free tier)

---

### Phase 7: Blockchain Integration (3-4 hours)

**Transaction Signing (`lib/blockchain/transaction.ts`):**
```typescript
import { Api, JsonRpc } from 'eosjs';
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig';

export async function signTransaction(
  action: any,
  privateKey: string
) {
  const rpc = new JsonRpc(process.env.NEXT_PUBLIC_API_URL + '/chain');
  const signatureProvider = new JsSignatureProvider([privateKey]);
  const api = new Api({ rpc, signatureProvider });

  const result = await api.transact(
    { actions: [action] },
    { blocksBehind: 3, expireSeconds: 30 }
  );

  return result;
}

export function createChunkUploadTransaction(
  uploadId: string,
  chunkIndex: number,
  chunkData: string
) {
  return {
    account: 'verarta.core',
    name: 'uploadchunk',
    authorization: [{
      actor: 'user account', // Get from auth store
      permission: 'active',
    }],
    data: {
      chunk_id: Date.now() + chunkIndex,
      file_id: uploadId,
      owner: 'user account',
      chunk_index: chunkIndex,
      chunk_data: chunkData,
      chunk_size: chunkData.length,
    },
  };
}
```

---

### Phase 8: Dashboard & Pages (3-4 hours)

**Dashboard Layout:**
- Header with logo, user menu, logout
- Sidebar with navigation (Dashboard, Upload, Browse, Settings)
- Main content area
- Quota display in header

**Dashboard Page:**
- Recent uploads (last 10)
- Quota usage summary
- Quick stats (total artworks, total size)
- "Upload New" button

**Artwork Detail Page:**
- Full metadata display (decrypted)
- File list with download buttons
- Edit/delete buttons
- Blockchain transaction links

---

### Phase 9: Error Handling & Loading States (2-3 hours)

**Error Boundaries:**
- Root error boundary
- Page-level error boundaries
- Component error fallbacks

**Loading States:**
- Skeleton loaders for grids
- Spinners for buttons
- Progress bars for uploads
- Suspense boundaries

**Toast Notifications:**
- Success messages
- Error messages
- Info messages
- Auto-dismiss configuration

---

### Phase 10: Optimization & Polish (2-3 hours)

**Performance:**
- Image optimization with Next.js Image
- Code splitting with dynamic imports
- React Query caching strategies
- IndexedDB query optimization

**Accessibility:**
- ARIA labels
- Keyboard navigation
- Focus management
- Screen reader support

**Responsive Design:**
- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Touch-friendly buttons
- Collapsible sidebar on mobile

---

## Environment Setup

**Development:**
```env
NEXT_PUBLIC_API_URL=http://localhost:4321
NEXT_PUBLIC_CHAIN_ID=96f99757daf05efb9ed0f8bb675e643e4954a5b6c4c017a25a184ea27f0394cc
NEXT_PUBLIC_CONTRACT_ACCOUNT=verarta.core
NEXT_PUBLIC_DEV_MODE=true
```

**Production:**
```env
NEXT_PUBLIC_API_URL=https://api.verarta.com
NEXT_PUBLIC_CHAIN_ID=96f99757daf05efb9ed0f8bb675e643e4954a5b6c4c017a25a184ea27f0394cc
NEXT_PUBLIC_CONTRACT_ACCOUNT=verarta.core
NEXT_PUBLIC_DEV_MODE=false
```

---

## Testing Strategy

**Unit Tests:**
- Encryption/decryption functions
- Chunking utilities
- Validation schemas

**Integration Tests:**
- API client methods
- WebAuthn flow
- Upload flow

**E2E Tests (Playwright):**
- Registration → Verification → Login
- Upload → Progress → View
- Download → Decrypt → Verify

---

## Deployment

**Build:**
```bash
npm run build
```

**Static Export (optional):**
```bash
# If using static hosting
npm run build && npm run export
```

**PM2 on Server:**
```bash
cd frontend
pm2 start npm --name "verarta-frontend" -- start
```

**Nginx Configuration:**
```nginx
server {
  listen 80;
  server_name verarta.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }

  location /api/ {
    proxy_pass http://localhost:4321/api/;
  }
}
```

---

## Success Criteria

- ✅ User can register with email + WebAuthn
- ✅ User can verify email (or use bypass code in DEV_MODE)
- ✅ User can upload files with client-side encryption
- ✅ Files chunked to 256KB and uploaded to blockchain
- ✅ User can view uploaded artworks
- ✅ User can download and decrypt files
- ✅ Quota usage displayed and enforced
- ✅ Responsive on mobile, tablet, desktop
- ✅ Accessible (WCAG 2.1 Level AA)

---

## Timeline

**Week 1:**
- Days 1-2: Setup + Infrastructure + Auth
- Days 3-4: Encryption + Upload System
- Day 5: UI Components

**Week 2:**
- Days 1-2: Dashboard + Pages
- Days 3-4: Error Handling + Optimization
- Day 5: Testing + Bug Fixes

**Total:** ~10 days (60-80 hours)

---

## Next Steps After Frontend

1. **Email Setup** - Configure SMTP (Mail-in-a-Box)
2. **SSL/HTTPS** - Install certificates
3. **Production Deploy** - Deploy frontend + backend
4. **Security Audit** - Penetration testing
5. **Beta Launch** - Limited user testing

---

## References

- Next.js Docs: https://nextjs.org/docs
- libsodium.js: https://github.com/jedisct1/libsodium.js
- SimpleWebAuthn: https://simplewebauthn.dev/
- shadcn/ui: https://ui.shadcn.com/
- Zustand: https://github.com/pmndrs/zustand
