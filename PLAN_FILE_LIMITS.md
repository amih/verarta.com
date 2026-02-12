# Implementation Plan: File Size Limits and Image Processing for Verarta

## 1. SYSTEM ANALYSIS

Based on my exploration, here's what currently exists:

**Current Upload System:**
- Chunked upload flow with 256KB chunks (safe for 512KB action limit)
- Maximum file size: 100MB per file (from .env.example)
- Temporary file storage with cleanup after 24 hours
- Database tables: `users`, `artwork_uploads`, `file_uploads`, `chunk_uploads`
- Smart contract tables: `artworks`, `artfiles` with chunk tracking
- No account tier/quota system exists yet
- No image processing pipeline exists

**Architecture:**
- React frontend (Astro islands)
- Astro SSR backend with PostgreSQL and Redis
- Antelope/Spring blockchain with custom 5s block interval
- Hyperion history indexer for chunk retrieval

## 2. RECOMMENDED LIMITS BASED ON RESEARCH

**Free Account Limits:**
- **Per-file size limit:** 5 MB (reduced from 100MB)
- **Image resolution limit:** 1920x1080 pixels (Full HD)
- **Daily upload quota:** 10 files per day
- **Daily bandwidth quota:** 25 MB per day
- **Thumbnail resolution:** 200x200 pixels (already mentioned in PLAN.md)

**Paid Account Limits (Premium tier):**
- **Per-file size limit:** 50 MB
- **Image resolution limit:** 4096x2160 pixels (4K)
- **Daily upload quota:** 100 files per day
- **Daily bandwidth quota:** 500 MB per day

**Rationale:**
- 5MB free limit balances user experience with blockchain storage costs
- 1920x1080 is sufficient for high-quality web viewing
- 10 files/day prevents abuse while allowing genuine artwork uploads
- Limits are enforced both client-side (UX) and server-side (security)

## 3. CLIENT-SIDE IMAGE PROCESSING LIBRARIES

**Recommended Stack:**

1. **react-image-crop** (v11+) - For cropping functionality
   - MIT licensed, actively maintained
   - Responsive and touch-friendly
   - Returns crop coordinates for processing

2. **browser-image-compression** (v2+) - For resizing and compression
   - Compresses images client-side using Canvas API
   - Configurable max dimensions and file size
   - Maintains aspect ratio
   - Works in all modern browsers

3. **react-easy-crop** (alternative, more modern)
   - Better UX with zoom/pan capabilities
   - Touch gesture support
   - Returns cropped area coordinates

4. **canvas-rotate** or native Canvas API - For rotation
   - Rotate by 90°, 180°, 270° or arbitrary angles
   - Preserve quality during rotation

## 4. DATABASE SCHEMA CHANGES

**New table: `user_quotas`**
```sql
CREATE TABLE user_quotas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  account_tier VARCHAR(20) DEFAULT 'free',  -- 'free', 'premium'
  daily_file_limit INTEGER DEFAULT 10,
  daily_bandwidth_limit BIGINT DEFAULT 26214400,  -- 25 MB in bytes
  max_file_size BIGINT DEFAULT 5242880,           -- 5 MB in bytes
  max_image_resolution INTEGER DEFAULT 2073600,   -- 1920x1080 pixels
  tier_expires_at TIMESTAMP,                      -- null for free, expiry for premium
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_quotas_user_id ON user_quotas(user_id);
CREATE INDEX idx_user_quotas_tier ON user_quotas(account_tier);
```

**New table: `upload_usage_logs`**
```sql
CREATE TABLE upload_usage_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  file_size BIGINT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  date DATE DEFAULT CURRENT_DATE
);

CREATE INDEX idx_upload_usage_logs_user_date ON upload_usage_logs(user_id, date);
```

**New table: `image_processing_metadata`**
```sql
CREATE TABLE image_processing_metadata (
  id SERIAL PRIMARY KEY,
  file_upload_id INTEGER REFERENCES file_uploads(id) ON DELETE CASCADE,
  original_width INTEGER,
  original_height INTEGER,
  processed_width INTEGER,
  processed_height INTEGER,
  crop_x INTEGER,
  crop_y INTEGER,
  crop_width INTEGER,
  crop_height INTEGER,
  rotation_degrees INTEGER DEFAULT 0,
  compression_quality INTEGER,  -- 1-100
  original_size BIGINT,
  processed_size BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_image_processing_file_upload_id ON image_processing_metadata(file_upload_id);
```

**Modify `users` table:**
```sql
ALTER TABLE users ADD COLUMN account_tier VARCHAR(20) DEFAULT 'free';
ALTER TABLE users ADD COLUMN tier_expires_at TIMESTAMP;
```

## 5. SMART CONTRACT CHANGES

**New table: `usagequotas`**
```cpp
struct [[eosio::table]] usagequota {
  name          account;          // user's blockchain account
  uint32_t      daily_file_count; // files uploaded today
  uint64_t      daily_bytes;      // bytes uploaded today
  uint32_t      quota_date;       // Unix timestamp of current day (midnight)
  uint8_t       tier;             // 0=free, 1=premium

  uint64_t primary_key() const { return account.value; }
};

typedef eosio::multi_index<"usagequotas"_n, usagequota> usagequotas_table;
```

**New action: `recordusage`**
```cpp
ACTION verartacore::recordusage(
  name owner,
  uint64_t file_size,
  uint32_t date
) {
  require_auth(owner);

  usagequotas_table quotas(get_self(), get_self().value);
  auto quota_itr = quotas.find(owner.value);

  uint32_t today = current_time_point().sec_since_epoch() / 86400 * 86400; // midnight today

  if (quota_itr == quotas.end()) {
    quotas.emplace(owner, [&](auto& row) {
      row.account = owner;
      row.daily_file_count = 1;
      row.daily_bytes = file_size;
      row.quota_date = today;
      row.tier = 0; // default free
    });
  } else {
    quotas.modify(quota_itr, owner, [&](auto& row) {
      // Reset if new day
      if (row.quota_date < today) {
        row.daily_file_count = 1;
        row.daily_bytes = file_size;
        row.quota_date = today;
      } else {
        row.daily_file_count++;
        row.daily_bytes += file_size;
      }
    });
  }
}
```

**New action: `settier`** (admin only)
```cpp
ACTION verartacore::settier(name account, uint8_t tier) {
  require_auth(get_self()); // only contract account can set tier

  usagequotas_table quotas(get_self(), get_self().value);
  auto quota_itr = quotas.find(account.value);

  if (quota_itr == quotas.end()) {
    quotas.emplace(get_self(), [&](auto& row) {
      row.account = account;
      row.tier = tier;
      row.daily_file_count = 0;
      row.daily_bytes = 0;
      row.quota_date = 0;
    });
  } else {
    quotas.modify(quota_itr, get_self(), [&](auto& row) {
      row.tier = tier;
    });
  }
}
```

## 6. FRONTEND UI COMPONENTS

**New component: `/frontend/src/components/artworks/ImageEditor.tsx`**

Component structure:
```typescript
interface ImageEditorProps {
  file: File;
  maxFileSize: number;
  maxResolution: number;
  onComplete: (processedFile: File, metadata: ProcessingMetadata) => void;
  onCancel: () => void;
}

interface ProcessingMetadata {
  originalDimensions: { width: number; height: number };
  processedDimensions: { width: number; height: number };
  crop?: { x: number; y: number; width: number; height: number };
  rotation: number;
  compressionQuality: number;
}
```

Features:
- Load and display image preview
- Crop tool with draggable/resizable area
- Rotate buttons (90°, 180°, 270°)
- Resolution slider (if exceeds max)
- Real-time file size preview
- Before/After comparison view
- "Process Image" button that applies all transformations
- Quality slider for compression

**Updated component: `/frontend/src/components/artworks/FileUpload.tsx`**

Add:
- Pre-upload validation (file size, image dimensions)
- Display current quota usage
- Show remaining daily uploads
- Trigger ImageEditor for image files before upload
- Progress indicator with quota visualization

**New component: `/frontend/src/components/account/QuotaDisplay.tsx`**

Display:
- Current account tier (free/premium)
- Files uploaded today / daily limit
- Bandwidth used today / daily limit
- Progress bars for visual representation
- Upgrade to premium button (for free users)

## 7. BACKEND API CHANGES

**New middleware: `/backend/src/middleware/checkQuota.ts`**

```typescript
export async function checkQuota(userId: number, fileSize: number): Promise<{
  allowed: boolean;
  reason?: string;
  currentUsage: QuotaUsage;
}> {
  // 1. Get user's quota settings
  // 2. Get today's usage from upload_usage_logs
  // 3. Check file count limit
  // 4. Check bandwidth limit
  // 5. Return result
}
```

**Modified endpoint: `/backend/src/pages/api/artworks/upload-start.ts`**

Add before processing:
```typescript
// 1. Validate file size against user's tier limit
const userQuota = await getUserQuota(userId);
if (fileSize > userQuota.max_file_size) {
  return new Response('File exceeds size limit for your account tier', { status: 413 });
}

// 2. Check daily quotas
const quotaCheck = await checkQuota(userId, fileSize);
if (!quotaCheck.allowed) {
  return new Response(quotaCheck.reason, { status: 429 });
}

// 3. For images, validate resolution
if (isImage(mimeType)) {
  const dimensions = await getImageDimensions(buffer);
  if (dimensions.width * dimensions.height > userQuota.max_image_resolution) {
    return new Response('Image resolution exceeds limit for your account tier', { status: 413 });
  }
}

// 4. Record usage log
await recordUploadUsage(userId, fileSize);
```

**New endpoint: `/backend/src/pages/api/users/quota.ts`**

```typescript
GET /api/users/quota
Response: {
  tier: 'free' | 'premium',
  limits: {
    maxFileSize: number,
    maxResolution: number,
    dailyFileLimit: number,
    dailyBandwidthLimit: number
  },
  usage: {
    filesUploadedToday: number,
    bandwidthUsedToday: number,
    remainingFiles: number,
    remainingBandwidth: number
  },
  tierExpiresAt?: string
}
```

**New endpoint: `/backend/src/pages/api/artworks/process-image.ts`**

```typescript
POST /api/artworks/process-image
Request: {
  tempFilePath: string,
  crop?: { x, y, width, height },
  rotation?: number,
  targetQuality?: number
}
Response: {
  processedPath: string,
  originalSize: number,
  processedSize: number,
  dimensions: { width, height }
}
```

Uses sharp library server-side for:
- Cropping
- Rotating
- Resizing to max resolution
- Compression

**New endpoint: `/backend/src/pages/api/admin/set-tier.ts`** (admin only)

```typescript
POST /api/admin/set-tier
Request: {
  userId: number,
  tier: 'free' | 'premium',
  expiresAt?: string
}
```

## 8. SERVER-SIDE IMAGE PROCESSING

**Install sharp library:**
```json
{
  "dependencies": {
    "sharp": "^0.33.0"
  }
}
```

**New utility: `/backend/src/lib/imageProcessor.ts`**

```typescript
import sharp from 'sharp';

export async function processImage(options: {
  inputPath: string;
  outputPath: string;
  crop?: { left: number; top: number; width: number; height: number };
  rotation?: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}): Promise<ProcessingResult> {
  let pipeline = sharp(options.inputPath);

  // Apply rotation
  if (options.rotation) {
    pipeline = pipeline.rotate(options.rotation);
  }

  // Apply crop
  if (options.crop) {
    pipeline = pipeline.extract(options.crop);
  }

  // Resize if exceeds max dimensions
  if (options.maxWidth || options.maxHeight) {
    pipeline = pipeline.resize(options.maxWidth, options.maxHeight, {
      fit: 'inside',
      withoutEnlargement: true
    });
  }

  // Apply compression
  const metadata = await pipeline.metadata();
  if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
    pipeline = pipeline.jpeg({ quality: options.quality || 85 });
  } else if (metadata.format === 'png') {
    pipeline = pipeline.png({ quality: options.quality || 85 });
  } else if (metadata.format === 'webp') {
    pipeline = pipeline.webp({ quality: options.quality || 85 });
  }

  // Save processed image
  await pipeline.toFile(options.outputPath);

  // Get file sizes
  const originalStats = await fs.stat(options.inputPath);
  const processedStats = await fs.stat(options.outputPath);
  const processedMetadata = await sharp(options.outputPath).metadata();

  return {
    originalSize: originalStats.size,
    processedSize: processedStats.size,
    dimensions: {
      width: processedMetadata.width!,
      height: processedMetadata.height!
    }
  };
}

export async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0
  };
}
```

## 9. INTEGRATION WITH BLOCKCHAIN

**Modified upload flow:**

1. User selects image file
2. Frontend validates file size and type
3. If image, open ImageEditor component
4. User crops/rotates/adjusts image
5. Frontend compresses to target size/resolution
6. Upload processed image to backend
7. Backend validates again (server-side enforcement)
8. Backend checks user quotas
9. Backend calls `recordusage` blockchain action
10. Backend proceeds with chunked upload
11. Usage logged in PostgreSQL for dashboard

## 10. FRONTEND LIBRARIES TO ADD

```json
{
  "dependencies": {
    "react-easy-crop": "^5.0.0",
    "browser-image-compression": "^2.0.2"
  },
  "devDependencies": {
    "@types/browser-image-compression": "^2.0.0"
  }
}
```

## 11. STEP-BY-STEP IMPLEMENTATION SEQUENCE

**Phase 1: Database & Schema (Backend Foundation)**
1. Create database migration for new tables (`user_quotas`, `upload_usage_logs`, `image_processing_metadata`)
2. Update `users` table with tier columns
3. Create seed data with default quotas for existing users
4. Write database access functions for quota management

**Phase 2: Smart Contract Updates**
1. Add `usagequotas` table to `verarta.core.cpp`
2. Implement `recordusage` action
3. Implement `settier` action (admin only)
4. Compile and deploy updated contract
5. Test quota tracking via `cleos`

**Phase 3: Backend Quota Enforcement**
1. Create quota middleware (`checkQuota.ts`)
2. Create quota utilities library
3. Update `upload-start.ts` to enforce limits
4. Create `/api/users/quota` endpoint
5. Create `/api/admin/set-tier` endpoint
6. Add usage logging to upload completion

**Phase 4: Server-Side Image Processing**
1. Install sharp library
2. Create `imageProcessor.ts` utility
3. Create `/api/artworks/process-image` endpoint
4. Add image dimension validation
5. Implement server-side crop/rotate/resize

**Phase 5: Frontend UI Components**
1. Install `react-easy-crop` and `browser-image-compression`
2. Create `ImageEditor.tsx` component with crop/rotate UI
3. Create `QuotaDisplay.tsx` component
4. Update `FileUpload.tsx` to integrate ImageEditor
5. Add pre-upload validation
6. Add real-time file size preview

**Phase 6: Frontend Integration**
1. Create `useQuota` hook for quota data fetching
2. Update `useCreateArtwork` hook to handle image processing
3. Add client-side compression before upload
4. Add quota display to user dashboard
5. Add upgrade prompts for free users

**Phase 7: Admin Interface**
1. Create admin panel for tier management
2. Add usage analytics dashboard
3. Add bulk tier update functionality
4. Add quota override capability

**Phase 8: Testing & Optimization**
1. Test quota enforcement (boundary cases)
2. Test image processing quality
3. Test daily reset logic
4. Performance test large image processing
5. Test concurrent upload limits
6. Cross-browser testing for ImageEditor

**Phase 9: Documentation & Deployment**
1. Update README with quota information
2. Create user guide for image editor
3. Add quota documentation to API docs
4. Deploy database migrations
5. Deploy smart contract updates
6. Deploy backend changes
7. Deploy frontend changes

## 12. FUTURE ENHANCEMENTS (POST-MVP)

1. **Payment Integration (TODO #4)**
   - Stripe/crypto payment gateway
   - Automatic tier upgrade upon payment
   - Subscription renewal reminders

2. **Advanced Image Features**
   - Filters (grayscale, sepia, etc.)
   - Brightness/contrast adjustment
   - Text/watermark overlay

3. **Video Support**
   - Video thumbnail extraction
   - Video compression
   - Duration limits by tier

4. **Bulk Upload**
   - Multiple file selection
   - Batch processing
   - Progress tracking for all files

5. **Storage Analytics**
   - User storage dashboard
   - Historical usage charts
   - Cost projections

## Critical Files for Implementation

Based on the implementation plan, here are the most critical files:

**Backend (to create):**
- `/home/ami/dev/work/verarta.com/backend/src/middleware/checkQuota.ts` - Core quota enforcement logic
- `/home/ami/dev/work/verarta.com/backend/src/lib/imageProcessor.ts` - Server-side image processing with sharp
- `/home/ami/dev/work/verarta.com/backend/src/pages/api/users/quota.ts` - Quota information endpoint
- `/home/ami/dev/work/verarta.com/backend/src/pages/api/artworks/upload-start.ts` - Modify to add quota checks
- `/home/ami/dev/work/verarta.com/backend/src/lib/quotaUtils.ts` - Quota calculation and validation utilities

**Frontend (to create):**
- `/home/ami/dev/work/verarta.com/frontend/src/components/artworks/ImageEditor.tsx` - Main image editing UI
- `/home/ami/dev/work/verarta.com/frontend/src/components/account/QuotaDisplay.tsx` - Quota usage display
- `/home/ami/dev/work/verarta.com/frontend/src/components/artworks/FileUpload.tsx` - Modify to integrate image editor
- `/home/ami/dev/work/verarta.com/frontend/src/hooks/useQuota.ts` - Hook for quota data management
- `/home/ami/dev/work/verarta.com/frontend/src/lib/imageProcessing.ts` - Client-side image utilities

**Smart Contracts (to create):**
- `/home/ami/dev/work/verarta.com/blockchain/contracts/verarta.core/verarta.core.cpp` - Add quota tables and actions
- `/home/ami/dev/work/verarta.com/blockchain/contracts/verarta.core/verarta.core.hpp` - Header with new structures

**Database:**
- `/home/ami/dev/work/verarta.com/backend/src/migrations/003_add_quotas.sql` - Migration for quota tables
- `/home/ami/dev/work/verarta.com/backend/src/migrations/004_add_image_metadata.sql` - Migration for image metadata
