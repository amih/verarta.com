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

## 2. RECOMMENDED LIMITS WITH DUAL-TIER QUOTA SYSTEM

### Free Account Limits

**File Constraints:**
- **Per-file size limit:** 5 MB
- **Image resolution limit:** 1920x1080 pixels (Full HD - 2.07 megapixels)
- **Thumbnail resolution:** 200x200 pixels

**Daily Quotas:**
- **Daily upload quota:** 10 files per day
- **Daily bandwidth quota:** 25 MB per day

**Weekly Quotas:**
- **Weekly upload quota:** 40 files per week
- **Weekly bandwidth quota:** 100 MB per week

### Premium Account Limits

**File Constraints:**
- **Per-file size limit:** 50 MB
- **Image resolution limit:** 4096x2160 pixels (4K - 8.85 megapixels)
- **Thumbnail resolution:** 400x400 pixels

**Daily Quotas:**
- **Daily upload quota:** 50 files per day
- **Daily bandwidth quota:** 200 MB per day

**Weekly Quotas:**
- **Weekly upload quota:** 200 files per week
- **Weekly bandwidth quota:** 600 MB per week

### Rationale for Dual-Tier Quota System

**Why Both Daily AND Weekly Limits?**

1. **Flexibility for Burst Usage**
   - Users can upload more on certain days if they haven't used their weekly allowance
   - Example: Free user can upload 10 files Monday, 0 Tuesday-Friday, then 10 Saturday = 20 files/week (within 40 limit)
   - Prevents frustration from strict daily limits that don't roll over

2. **Prevention of Sustained Abuse**
   - Daily limits alone can be circumvented by sustained daily uploads
   - Weekly limits cap total consumption even if daily limits vary
   - Example: Without weekly cap, user could upload 10 files every day = 70 files/week (excessive)

3. **Better UX for Legitimate Users**
   - Artists often work in bursts (editing session = many uploads in one day)
   - Weekly limits accommodate this natural workflow
   - Daily limits prevent single-day storage bombs

4. **Cost Management**
   - Blockchain storage costs are cumulative over time
   - Weekly quotas provide predictable cost ceilings
   - Easier to calculate infrastructure costs: 40 files/week/user vs variable daily usage

5. **Conversion Incentive**
   - Free users hitting weekly limits mid-week see clear value in Premium
   - Premium offers 5x weekly capacity (40→200 files) - strong upgrade motivation
   - Daily limits (10→50) offer only 5x but weekly (40→200) shows the same scale

6. **Spam & Abuse Prevention**
   - Combined limits create multiple checkpoints
   - Harder for bad actors to exploit single-metric systems
   - Rate limiting at two timescales catches different abuse patterns

**Limit Ratios Explained:**

| Tier | Daily Files | Weekly Files | Ratio | Rationale |
|------|-------------|--------------|-------|-----------|
| Free | 10 | 40 | 4.0x | Allows 4 days of max usage per week |
| Premium | 50 | 200 | 4.0x | Same flexibility ratio for consistency |

| Tier | Daily MB | Weekly MB | Ratio | Rationale |
|------|----------|-----------|-------|-----------|
| Free | 25 | 100 | 4.0x | Matches file count ratio |
| Premium | 200 | 600 | 3.0x | Accounts for larger file sizes (50MB max vs 5MB) |

**Weekly Limit Reset Logic:**
- Resets every Monday at 00:00 UTC (ISO 8601 week standard)
- Clear, predictable reset schedule
- Aligns with typical work week patterns

**Why Not Monthly Limits?**
- Too long a timeframe - users could exhaust quota early and be blocked for weeks
- Harder to predict and budget infrastructure costs
- Weekly provides good balance between flexibility and control

### Enforcement Priority
```
1. Check per-file size limit (immediate rejection)
2. Check daily file count limit
3. Check daily bandwidth limit
4. Check weekly file count limit
5. Check weekly bandwidth limit
6. Check image resolution limit (if applicable)
```

If any check fails, upload is rejected with specific error message indicating which limit was exceeded and when it resets.

## 3. CLIENT-SIDE IMAGE PROCESSING LIBRARIES

**Recommended Stack:**

1. **react-easy-crop** (v5+) - For cropping functionality
   - Better UX with zoom/pan capabilities
   - Touch gesture support
   - Returns cropped area coordinates
   - MIT licensed, actively maintained

2. **browser-image-compression** (v2+) - For resizing and compression
   - Compresses images client-side using Canvas API
   - Configurable max dimensions and file size
   - Maintains aspect ratio
   - Works in all modern browsers
   - Reduces upload bandwidth

3. **Native Canvas API** - For rotation
   - Rotate by 90°, 180°, 270° or arbitrary angles
   - No additional dependencies
   - Preserve quality during rotation

## 4. DATABASE SCHEMA CHANGES

**New table: `user_quotas`**
```sql
CREATE TABLE user_quotas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  account_tier VARCHAR(20) DEFAULT 'free',  -- 'free', 'premium'

  -- Daily limits
  daily_file_limit INTEGER DEFAULT 10,
  daily_bandwidth_limit BIGINT DEFAULT 26214400,  -- 25 MB in bytes

  -- Weekly limits
  weekly_file_limit INTEGER DEFAULT 40,
  weekly_bandwidth_limit BIGINT DEFAULT 104857600,  -- 100 MB in bytes

  -- File constraints
  max_file_size BIGINT DEFAULT 5242880,           -- 5 MB in bytes
  max_image_resolution INTEGER DEFAULT 2073600,   -- 1920x1080 pixels

  -- Tier management
  tier_expires_at TIMESTAMP,                      -- null for free, expiry for premium
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_quotas_user_id ON user_quotas(user_id);
CREATE INDEX idx_user_quotas_tier ON user_quotas(account_tier);
CREATE INDEX idx_user_quotas_expires ON user_quotas(tier_expires_at);
```

**New table: `upload_usage_logs`**
```sql
CREATE TABLE upload_usage_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  file_size BIGINT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  upload_date DATE DEFAULT CURRENT_DATE,
  upload_week INTEGER GENERATED ALWAYS AS (EXTRACT(WEEK FROM uploaded_at)) STORED,
  upload_year INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM uploaded_at)) STORED
);

CREATE INDEX idx_upload_usage_logs_user_date ON upload_usage_logs(user_id, upload_date);
CREATE INDEX idx_upload_usage_logs_user_week ON upload_usage_logs(user_id, upload_year, upload_week);
```

**New table: `weekly_usage_summary`** (for performance optimization)
```sql
CREATE TABLE weekly_usage_summary (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,  -- Monday of the week
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  file_count INTEGER DEFAULT 0,
  total_bytes BIGINT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, year, week_number)
);

CREATE INDEX idx_weekly_usage_user_week ON weekly_usage_summary(user_id, year, week_number);
CREATE INDEX idx_weekly_usage_week_start ON weekly_usage_summary(week_start);
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

**Database functions for quota checking:**
```sql
-- Get daily usage
CREATE OR REPLACE FUNCTION get_daily_usage(p_user_id INTEGER, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(file_count BIGINT, total_bytes BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COALESCE(SUM(file_size), 0)::BIGINT
  FROM upload_usage_logs
  WHERE user_id = p_user_id AND upload_date = p_date;
END;
$$ LANGUAGE plpgsql;

-- Get weekly usage
CREATE OR REPLACE FUNCTION get_weekly_usage(p_user_id INTEGER, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(file_count BIGINT, total_bytes BIGINT) AS $$
DECLARE
  v_week_start DATE;
BEGIN
  -- Get Monday of current week
  v_week_start := DATE_TRUNC('week', p_date)::DATE;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COALESCE(SUM(file_size), 0)::BIGINT
  FROM upload_usage_logs
  WHERE user_id = p_user_id
    AND uploaded_at >= v_week_start
    AND uploaded_at < v_week_start + INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Update weekly summary (called after each upload)
CREATE OR REPLACE FUNCTION update_weekly_summary(p_user_id INTEGER, p_file_size BIGINT)
RETURNS VOID AS $$
DECLARE
  v_week_start DATE;
  v_week_number INTEGER;
  v_year INTEGER;
BEGIN
  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;
  v_week_number := EXTRACT(WEEK FROM CURRENT_DATE);
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);

  INSERT INTO weekly_usage_summary (user_id, week_start, week_number, year, file_count, total_bytes)
  VALUES (p_user_id, v_week_start, v_week_number, v_year, 1, p_file_size)
  ON CONFLICT (user_id, year, week_number)
  DO UPDATE SET
    file_count = weekly_usage_summary.file_count + 1,
    total_bytes = weekly_usage_summary.total_bytes + p_file_size,
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql;
```

## 5. SMART CONTRACT CHANGES

**New table: `usagequotas`**
```cpp
struct [[eosio::table]] usagequota {
  name          account;          // user's blockchain account

  // Daily tracking
  uint32_t      daily_file_count; // files uploaded today
  uint64_t      daily_bytes;      // bytes uploaded today
  uint32_t      quota_date;       // Unix timestamp of current day (midnight)

  // Weekly tracking
  uint32_t      weekly_file_count; // files uploaded this week
  uint64_t      weekly_bytes;      // bytes uploaded this week
  uint32_t      week_start;        // Unix timestamp of Monday 00:00 UTC

  // Account tier
  uint8_t       tier;             // 0=free, 1=premium

  uint64_t primary_key() const { return account.value; }
};

typedef eosio::multi_index<"usagequotas"_n, usagequota> usagequotas_table;
```

**Helper function for week start calculation:**
```cpp
// Get Monday 00:00 UTC for a given timestamp
uint32_t get_week_start(uint32_t timestamp) {
  // Calculate days since Unix epoch
  uint32_t days = timestamp / 86400;

  // Thursday Jan 1, 1970 = day 0
  // Days since Monday (0=Mon, 1=Tue, ..., 6=Sun)
  uint32_t day_of_week = (days + 3) % 7;  // +3 because epoch started on Thursday

  // Get Monday of current week
  uint32_t monday_days = days - day_of_week;

  return monday_days * 86400;  // Convert back to seconds
}
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

  uint32_t now = current_time_point().sec_since_epoch();
  uint32_t today = now / 86400 * 86400;  // midnight today
  uint32_t this_week_start = get_week_start(now);

  if (quota_itr == quotas.end()) {
    // Create new quota record
    quotas.emplace(owner, [&](auto& row) {
      row.account = owner;
      row.daily_file_count = 1;
      row.daily_bytes = file_size;
      row.quota_date = today;
      row.weekly_file_count = 1;
      row.weekly_bytes = file_size;
      row.week_start = this_week_start;
      row.tier = 0; // default free
    });
  } else {
    quotas.modify(quota_itr, owner, [&](auto& row) {
      // Reset daily if new day
      if (row.quota_date < today) {
        row.daily_file_count = 1;
        row.daily_bytes = file_size;
        row.quota_date = today;
      } else {
        row.daily_file_count++;
        row.daily_bytes += file_size;
      }

      // Reset weekly if new week
      if (row.week_start < this_week_start) {
        row.weekly_file_count = 1;
        row.weekly_bytes = file_size;
        row.week_start = this_week_start;
      } else {
        row.weekly_file_count++;
        row.weekly_bytes += file_size;
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
      row.weekly_file_count = 0;
      row.weekly_bytes = 0;
      row.week_start = 0;
    });
  } else {
    quotas.modify(quota_itr, get_self(), [&](auto& row) {
      row.tier = tier;
    });
  }
}
```

**New action: `getquota`** (read-only helper)
```cpp
// Helper to check quota without modifying state
ACTION verartacore::getquota(name account) {
  usagequotas_table quotas(get_self(), get_self().value);
  auto quota_itr = quotas.find(account.value);

  check(quota_itr != quotas.end(), "Quota record not found");

  // This would be used by backend to check limits before upload
  // Returns quota data for display/validation
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
- Crop tool with draggable/resizable area (react-easy-crop)
- Rotate buttons (90°, 180°, 270°)
- Resolution slider (if exceeds max)
- Real-time file size preview
- Before/After comparison view
- "Process Image" button that applies all transformations
- Quality slider for compression
- Shows estimated final file size

**Updated component: `/frontend/src/components/artworks/FileUpload.tsx`**

Add:
- Pre-upload validation (file size, image dimensions)
- Display current quota usage (daily AND weekly)
- Show remaining daily uploads
- Show remaining weekly uploads
- Trigger ImageEditor for image files before upload
- Progress indicator with dual quota visualization
- Warning when approaching limits (>80% usage)
- Error messages specifying which limit was exceeded

**New component: `/frontend/src/components/account/QuotaDisplay.tsx`**

Display with tabs or sections:

**Daily Quota Section:**
- Files uploaded today / daily limit
- Bandwidth used today / daily limit
- Progress bars (green <70%, yellow 70-90%, red >90%)
- Time until daily reset (countdown)

**Weekly Quota Section:**
- Files uploaded this week / weekly limit
- Bandwidth used this week / weekly limit
- Progress bars with same color coding
- Day of week indicator (Mon-Sun)
- Time until weekly reset (countdown to Monday 00:00 UTC)

**Account Info:**
- Current account tier (free/premium)
- Upgrade to premium button (for free users)
- Tier expiry date (for premium users)

**Visual Design:**
```
┌─────────────────────────────────────┐
│  Today's Usage                      │
│  ━━━━━━━━━━━━━━━━━━━━  6/10 files  │
│  ━━━━━━━━━━━━━━━━━     15/25 MB    │
│  Resets in 8h 23m                   │
├─────────────────────────────────────┤
│  This Week's Usage                  │
│  ━━━━━━━━━━━━━━━━━━━━  22/40 files │
│  ━━━━━━━━━━━━━━━━      55/100 MB   │
│  Resets Monday 00:00 UTC            │
│  [3 days remaining]                 │
└─────────────────────────────────────┘
```

## 7. BACKEND API CHANGES

**New middleware: `/backend/src/middleware/checkQuota.ts`**

```typescript
export interface QuotaUsage {
  // Daily
  dailyFilesUsed: number;
  dailyBytesUsed: number;
  dailyFilesRemaining: number;
  dailyBytesRemaining: number;
  dailyResetAt: Date;

  // Weekly
  weeklyFilesUsed: number;
  weeklyBytesUsed: number;
  weeklyFilesRemaining: number;
  weeklyBytesRemaining: number;
  weeklyResetAt: Date;

  // Limits
  dailyFileLimit: number;
  dailyBandwidthLimit: number;
  weeklyFileLimit: number;
  weeklyBandwidthLimit: number;
}

export async function checkQuota(
  userId: number,
  fileSize: number
): Promise<{
  allowed: boolean;
  reason?: string;
  limitType?: 'daily_files' | 'daily_bandwidth' | 'weekly_files' | 'weekly_bandwidth';
  currentUsage: QuotaUsage;
}> {
  // 1. Get user's quota settings
  const userQuota = await getUserQuota(userId);

  // 2. Get today's usage from database
  const dailyUsage = await query(
    'SELECT * FROM get_daily_usage($1)',
    [userId]
  );

  // 3. Get this week's usage from database
  const weeklyUsage = await query(
    'SELECT * FROM get_weekly_usage($1)',
    [userId]
  );

  const dailyFiles = dailyUsage.rows[0].file_count;
  const dailyBytes = dailyUsage.rows[0].total_bytes;
  const weeklyFiles = weeklyUsage.rows[0].file_count;
  const weeklyBytes = weeklyUsage.rows[0].total_bytes;

  // Calculate reset times
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - nextMonday.getDay()) % 7 || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);

  const currentUsage: QuotaUsage = {
    dailyFilesUsed: dailyFiles,
    dailyBytesUsed: dailyBytes,
    dailyFilesRemaining: Math.max(0, userQuota.daily_file_limit - dailyFiles),
    dailyBytesRemaining: Math.max(0, userQuota.daily_bandwidth_limit - dailyBytes),
    dailyResetAt: tomorrow,

    weeklyFilesUsed: weeklyFiles,
    weeklyBytesUsed: weeklyBytes,
    weeklyFilesRemaining: Math.max(0, userQuota.weekly_file_limit - weeklyFiles),
    weeklyBytesRemaining: Math.max(0, userQuota.weekly_bandwidth_limit - weeklyBytes),
    weeklyResetAt: nextMonday,

    dailyFileLimit: userQuota.daily_file_limit,
    dailyBandwidthLimit: userQuota.daily_bandwidth_limit,
    weeklyFileLimit: userQuota.weekly_file_limit,
    weeklyBandwidthLimit: userQuota.weekly_bandwidth_limit,
  };

  // 4. Check daily file count
  if (dailyFiles >= userQuota.daily_file_limit) {
    return {
      allowed: false,
      reason: `Daily file limit reached (${userQuota.daily_file_limit} files). Resets at ${tomorrow.toISOString()}.`,
      limitType: 'daily_files',
      currentUsage,
    };
  }

  // 5. Check daily bandwidth
  if (dailyBytes + fileSize > userQuota.daily_bandwidth_limit) {
    return {
      allowed: false,
      reason: `Daily bandwidth limit would be exceeded. ${formatBytes(dailyBytes)}/${formatBytes(userQuota.daily_bandwidth_limit)} used. Resets at ${tomorrow.toISOString()}.`,
      limitType: 'daily_bandwidth',
      currentUsage,
    };
  }

  // 6. Check weekly file count
  if (weeklyFiles >= userQuota.weekly_file_limit) {
    return {
      allowed: false,
      reason: `Weekly file limit reached (${userQuota.weekly_file_limit} files). Resets Monday at ${nextMonday.toISOString()}.`,
      limitType: 'weekly_files',
      currentUsage,
    };
  }

  // 7. Check weekly bandwidth
  if (weeklyBytes + fileSize > userQuota.weekly_bandwidth_limit) {
    return {
      allowed: false,
      reason: `Weekly bandwidth limit would be exceeded. ${formatBytes(weeklyBytes)}/${formatBytes(userQuota.weekly_bandwidth_limit)} used. Resets Monday at ${nextMonday.toISOString()}.`,
      limitType: 'weekly_bandwidth',
      currentUsage,
    };
  }

  return { allowed: true, currentUsage };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

**Modified endpoint: `/backend/src/pages/api/artworks/upload-init.ts`**

Add before processing:
```typescript
// 1. Validate file size against user's tier limit
const userQuota = await getUserQuota(userId);
if (fileSize > userQuota.max_file_size) {
  return new Response(JSON.stringify({
    error: 'File exceeds size limit for your account tier',
    maxSize: userQuota.max_file_size,
    actualSize: fileSize,
    tier: userQuota.account_tier,
  }), { status: 413 });
}

// 2. Check daily AND weekly quotas
const quotaCheck = await checkQuota(userId, fileSize);
if (!quotaCheck.allowed) {
  return new Response(JSON.stringify({
    error: quotaCheck.reason,
    limitType: quotaCheck.limitType,
    usage: quotaCheck.currentUsage,
  }), { status: 429 });
}

// 3. For images, validate resolution
if (isImage(mimeType)) {
  const dimensions = await getImageDimensions(buffer);
  if (dimensions.width * dimensions.height > userQuota.max_image_resolution) {
    return new Response(JSON.stringify({
      error: 'Image resolution exceeds limit for your account tier',
      maxResolution: userQuota.max_image_resolution,
      actualResolution: dimensions.width * dimensions.height,
      dimensions: dimensions,
    }), { status: 413 });
  }
}

// 4. Record usage log
await recordUploadUsage(userId, fileSize);

// 5. Update weekly summary (async, non-blocking)
await query('SELECT update_weekly_summary($1, $2)', [userId, fileSize]);
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
    dailyBandwidthLimit: number,
    weeklyFileLimit: number,
    weeklyBandwidthLimit: number
  },
  usage: {
    // Daily
    dailyFilesUsed: number,
    dailyBytesUsed: number,
    dailyFilesRemaining: number,
    dailyBytesRemaining: number,
    dailyResetAt: string,  // ISO 8601

    // Weekly
    weeklyFilesUsed: number,
    weeklyBytesUsed: number,
    weeklyFilesRemaining: number,
    weeklyBytesRemaining: number,
    weeklyResetAt: string,  // ISO 8601
    weekStartDate: string,  // ISO 8601, Monday of current week
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
import fs from 'fs/promises';

export interface ProcessingResult {
  originalSize: number;
  processedSize: number;
  dimensions: { width: number; height: number };
}

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

  // Apply rotation first
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

**Modified upload flow with dual quota checks:**

1. User selects image file
2. Frontend fetches quota usage (GET /api/users/quota)
3. Frontend validates file size and type
4. Frontend checks if upload would exceed daily OR weekly limits
5. If image, open ImageEditor component
6. User crops/rotates/adjusts image
7. Frontend compresses to target size/resolution
8. Frontend re-checks quotas (may have changed)
9. Upload processed image to backend (POST /api/artworks/upload-init)
10. Backend validates again (server-side enforcement)
11. Backend checks daily AND weekly quotas
12. If any quota exceeded, return 429 with specific limit type
13. Backend calls `recordusage` blockchain action (tracks both daily/weekly)
14. Backend proceeds with chunked upload
15. Usage logged in PostgreSQL (upload_usage_logs)
16. Weekly summary updated (weekly_usage_summary)

**Error Response Examples:**

Daily file limit exceeded:
```json
{
  "error": "Daily file limit reached (10 files). Resets at 2026-02-13T00:00:00Z.",
  "limitType": "daily_files",
  "usage": {
    "dailyFilesUsed": 10,
    "dailyFilesRemaining": 0,
    "weeklyFilesUsed": 15,
    "weeklyFilesRemaining": 25
  }
}
```

Weekly bandwidth exceeded:
```json
{
  "error": "Weekly bandwidth limit would be exceeded. 95.2MB/100MB used. Resets Monday at 2026-02-17T00:00:00Z.",
  "limitType": "weekly_bandwidth",
  "usage": {
    "dailyBytesUsed": 15728640,
    "weeklyBytesUsed": 99876864,
    "weeklyBytesRemaining": 980736
  }
}
```

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

**Phase 1: Database & Schema (Backend Foundation) - 4-6 hours**
1. Create database migration for new tables
   - `user_quotas` (with daily AND weekly limits)
   - `upload_usage_logs` (with week tracking)
   - `weekly_usage_summary` (performance optimization)
   - `image_processing_metadata`
2. Create database functions
   - `get_daily_usage(user_id, date)`
   - `get_weekly_usage(user_id, date)`
   - `update_weekly_summary(user_id, file_size)`
3. Update `users` table with tier columns
4. Create seed data with default quotas for existing users
5. Write database access functions for quota management
6. Test all functions with sample data

**Phase 2: Smart Contract Updates - 3-4 hours**
1. Add `usagequotas` table to `verarta.core.cpp`
   - Include both daily and weekly tracking fields
2. Implement helper function `get_week_start(timestamp)`
3. Implement `recordusage` action with dual tracking
4. Implement `settier` action (admin only)
5. Implement `getquota` action (read-only)
6. Compile and test contract
7. Deploy updated contract to testnet
8. Test quota tracking via `cleos`
9. Deploy to production

**Phase 3: Backend Quota Enforcement - 6-8 hours**
1. Create quota middleware (`checkQuota.ts`)
   - Implement daily quota checks
   - Implement weekly quota checks
   - Add reset time calculations
   - Add detailed error messages
2. Create quota utilities library (`quotaUtils.ts`)
   - `getUserQuota(userId)`
   - `getDailyUsage(userId)`
   - `getWeeklyUsage(userId)`
   - `formatBytes(bytes)`
   - `getNextResetTime(type)`
3. Update `upload-init.ts` to enforce both limits
4. Create `/api/users/quota` endpoint
   - Return both daily and weekly usage
   - Calculate remaining quotas
   - Include reset times
5. Create `/api/admin/set-tier` endpoint
6. Add usage logging to upload completion
7. Test with various scenarios:
   - Daily limit reached but weekly available
   - Weekly limit reached but daily available
   - Both limits available
   - Both limits exceeded

**Phase 4: Server-Side Image Processing - 4-5 hours**
1. Install sharp library
2. Create `imageProcessor.ts` utility
3. Create `/api/artworks/process-image` endpoint
4. Add image dimension validation
5. Implement server-side crop/rotate/resize
6. Test with various image formats (JPEG, PNG, WebP)
7. Test performance with large images
8. Add error handling for corrupted images

**Phase 5: Frontend UI Components - 10-12 hours**
1. Install `react-easy-crop` and `browser-image-compression`
2. Create `ImageEditor.tsx` component
   - Implement crop UI with zoom/pan
   - Add rotate buttons
   - Add quality slider
   - Add before/after preview
   - Show estimated file size
3. Create `QuotaDisplay.tsx` component
   - Daily usage section with progress bars
   - Weekly usage section with progress bars
   - Countdown timers for resets
   - Color coding (green/yellow/red)
   - Upgrade prompt for free users
4. Update `FileUpload.tsx`
   - Integrate ImageEditor
   - Add pre-upload quota check
   - Show remaining capacity
   - Display appropriate warnings
   - Handle quota exceeded errors
5. Add real-time file size preview
6. Test responsive design on mobile

**Phase 6: Frontend Integration - 6-8 hours**
1. Create `useQuota` hook
   - Fetch quota data
   - Auto-refresh periodically
   - Cache with React Query or SWR
2. Update `useCreateArtwork` hook
   - Pre-flight quota check
   - Handle image processing
   - Retry logic for transient failures
3. Add client-side compression before upload
4. Add quota display to user dashboard
   - Show both daily and weekly stats
   - Highlight approaching limits
5. Add upgrade prompts for free users
   - Show when >80% of weekly quota used
   - Display benefit comparison (free vs premium)
6. Test entire upload flow end-to-end

**Phase 7: Admin Interface - 4-6 hours**
1. Create admin panel for tier management
   - List all users with current tiers
   - Filter by tier
   - Search by email/account
2. Add usage analytics dashboard
   - Daily/weekly usage graphs
   - Per-user consumption
   - Tier distribution
   - Cost projections
3. Add bulk tier update functionality
   - CSV import for tier assignments
   - Bulk expiry date updates
4. Add quota override capability
   - Temporary limit increases
   - One-time quota refills
5. Add audit log for tier changes

**Phase 8: Testing & Optimization - 8-10 hours**
1. Test quota enforcement (boundary cases)
   - Exactly at limit
   - 1 byte over limit
   - Concurrent uploads
   - Timezone edge cases (weekly reset)
2. Test image processing quality
   - Various formats
   - Various sizes
   - Quality vs file size tradeoffs
3. Test daily reset logic
   - Simulate day change
   - Verify counter resets
4. Test weekly reset logic
   - Simulate week change (Monday 00:00 UTC)
   - Verify counter resets
   - Test different timezones
5. Performance test large image processing
   - 50MB images (premium limit)
   - Concurrent processing
   - Memory usage
6. Test concurrent upload limits
   - Race conditions
   - Database lock handling
7. Cross-browser testing for ImageEditor
   - Chrome, Firefox, Safari, Edge
   - Mobile browsers
8. Load testing
   - 100 concurrent users
   - Database query performance
   - Weekly summary update performance

**Phase 9: Documentation & Deployment - 4-5 hours**
1. Update README with quota information
   - Document daily and weekly limits
   - Explain reset schedule
   - Provide upgrade instructions
2. Create user guide for image editor
   - Crop tutorial with screenshots
   - Quality optimization tips
   - File size reduction strategies
3. Add quota documentation to API docs
   - All endpoint specifications
   - Error code reference
   - Rate limit headers
4. Deploy database migrations
   - Backup production database
   - Run migrations
   - Verify data integrity
5. Deploy smart contract updates
   - Test on staging
   - Deploy to production
   - Verify quota tracking
6. Deploy backend changes
   - Run tests
   - Deploy to production
   - Monitor error logs
7. Deploy frontend changes
   - Build production bundle
   - Deploy to CDN
   - Verify in all browsers

**Total Estimated Time: 49-64 hours (1.5-2 months part-time)**

## 12. FUTURE ENHANCEMENTS (POST-MVP)

1. **Payment Integration (TODO #4)**
   - Stripe/crypto payment gateway
   - Automatic tier upgrade upon payment
   - Subscription renewal reminders
   - Usage-based billing (pay for overage)

2. **Advanced Image Features**
   - Filters (grayscale, sepia, vintage, etc.)
   - Brightness/contrast adjustment
   - Saturation and hue controls
   - Text/watermark overlay
   - Batch editing

3. **Video Support**
   - Video thumbnail extraction
   - Video compression
   - Duration limits by tier (e.g., 30s free, 5min premium)
   - Frame rate limits

4. **Bulk Upload**
   - Multiple file selection
   - Batch processing with preview
   - Progress tracking for all files
   - Pause/resume uploads
   - Queue management

5. **Storage Analytics**
   - User storage dashboard
   - Historical usage charts
   - Cost projections
   - Storage optimization suggestions
   - Duplicate file detection

6. **Quota Management Enhancements**
   - Monthly quotas (in addition to weekly)
   - Rollover unused quota (premium feature)
   - Quota gifting between users
   - Temporary quota boosts (promotions)
   - Quota pooling for teams/organizations

7. **Smart Quota Warnings**
   - Email notifications at 50%, 75%, 90% usage
   - Push notifications on mobile
   - Predictive warnings ("At current rate, you'll hit limit by Friday")
   - Personalized upgrade recommendations

## Critical Files for Implementation

Based on the implementation plan, here are the most critical files:

**Backend (to create):**
- `/home/ami/dev/work/verarta.com/backend/src/middleware/checkQuota.ts` - Core quota enforcement with daily AND weekly checks
- `/home/ami/dev/work/verarta.com/backend/src/lib/imageProcessor.ts` - Server-side image processing with sharp
- `/home/ami/dev/work/verarta.com/backend/src/pages/api/users/quota.ts` - Quota information endpoint with dual metrics
- `/home/ami/dev/work/verarta.com/backend/src/pages/api/artworks/upload-init.ts` - Modify to add dual quota checks
- `/home/ami/dev/work/verarta.com/backend/src/lib/quotaUtils.ts` - Quota calculation and validation utilities

**Frontend (to create):**
- `/home/ami/dev/work/verarta.com/frontend/src/components/artworks/ImageEditor.tsx` - Main image editing UI with react-easy-crop
- `/home/ami/dev/work/verarta.com/frontend/src/components/account/QuotaDisplay.tsx` - Quota usage display with daily/weekly sections
- `/home/ami/dev/work/verarta.com/frontend/src/components/artworks/FileUpload.tsx` - Modify to integrate image editor and quota checks
- `/home/ami/dev/work/verarta.com/frontend/src/hooks/useQuota.ts` - Hook for dual quota data management
- `/home/ami/dev/work/verarta.com/frontend/src/lib/imageProcessing.ts` - Client-side image utilities

**Smart Contracts (to modify):**
- `/home/ami/dev/work/verarta.com/blockchain/contracts/verarta.core/verarta.core.cpp` - Add usagequotas table with weekly tracking, recordusage action
- `/home/ami/dev/work/verarta.com/blockchain/contracts/verarta.core/verarta.core.hpp` - Header with new structures including weekly fields

**Database:**
- `/home/ami/dev/work/verarta.com/backend/src/migrations/003_add_quotas.sql` - Migration for quota tables with weekly limits
- `/home/ami/dev/work/verarta.com/backend/src/migrations/004_add_image_metadata.sql` - Migration for image processing metadata
- `/home/ami/dev/work/verarta.com/backend/src/migrations/005_weekly_summary.sql` - Migration for weekly_usage_summary table

## Testing Scenarios

**Scenario 1: Normal Usage**
- User uploads 5 files Monday (5 MB each)
- Usage: 5/10 daily, 25/25 MB daily, 5/40 weekly, 25/100 MB weekly
- ✅ All within limits

**Scenario 2: Daily Limit Hit, Weekly Available**
- User uploads 10 files Tuesday
- Tries to upload 11th file Tuesday
- ❌ Rejected: "Daily file limit reached (10 files)"
- ✅ Can upload Wednesday (daily resets, weekly at 10/40)

**Scenario 3: Weekly Limit Hit, Daily Available**
- User uploads 10 files/day Mon-Thurs (40 files total)
- Tries to upload Friday
- ❌ Rejected: "Weekly file limit reached (40 files)"
- Must wait until Monday reset

**Scenario 4: Flexible Usage Pattern**
- Monday: 15 files (exceeds daily 10, uses 15/40 weekly)
- ❌ After 10th file, rejected by daily limit
- Tuesday: Can upload 10 more (25/40 weekly)
- Wednesday: Can upload 10 more (35/40 weekly)
- Thursday: Can upload 5 more (40/40 weekly)
- Friday: ❌ Weekly limit hit

**Scenario 5: Weekend Burst**
- Mon-Fri: 5 files/day (25/40 weekly)
- Saturday: Try to upload 20 files
- ❌ After 10 files, daily limit hit
- Sunday: Can upload 5 more (40/40 weekly)
- Demonstrates weekly limit allows burst usage across multiple days

**Scenario 6: Premium Upgrade Mid-Week**
- Monday-Wednesday as free user: 30 files (30/40 weekly)
- Upgrades to premium Wednesday
- Limits change: 30/200 weekly, 0/50 daily (daily resets)
- Can upload 50 more Thursday, 50 Friday, etc.
- Demonstrates tier change doesn't reset weekly counter

## Summary

This implementation plan provides a comprehensive dual-quota system that:
- **Prevents abuse** through multiple checkpoints (daily AND weekly)
- **Improves UX** by allowing flexible usage patterns
- **Reduces costs** through predictable weekly caps
- **Drives conversions** via clear tier differentiation
- **Scales efficiently** with database optimization (weekly_usage_summary)

The 4.0x weekly-to-daily ratio provides ideal flexibility while maintaining control over total consumption. Weekly resets on Monday align with typical user behavior and provide predictable reset schedules.
