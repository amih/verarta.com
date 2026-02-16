# Parking Tickets System — Implementation Plan

## Overview

A blockchain-backed parking ticket management system for cities. Reuses the existing Antelope/Spring blockchain infrastructure from Verarta. Each city has an admin who configures the system and onboards enforcement employees. Employees issue tickets (with location, time, license plate, photo, and price). Car owners are notified by email (looked up from the national vehicle registry) and can pay by credit card. Tickets have a 90-day automatic deadline.

---

## 1. Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│   Frontend        │────▶│   Backend (API)   │────▶│  Blockchain          │
│   Next.js 16      │     │   Astro 5 SSR     │     │  Antelope/Spring     │
│   React 19        │     │   Node.js 20+     │     │  (existing cluster)  │
│   Tailwind CSS 4  │     │   PostgreSQL 16   │     │  New contract:       │
│   Zustand 5       │     │   Redis 8         │     │  parking.core        │
└──────────────────┘     └──────────────────┘     └──────────────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
               ┌────▼───┐ ┌────▼───┐ ┌─────▼────┐
               │ Stripe  │ │ Email  │ │ Vehicle  │
               │ Payment │ │ SMTP   │ │ Registry │
               │ Gateway │ │        │ │ API      │
               └─────────┘ └────────┘ └──────────┘
```

### Shared Infrastructure (from Verarta)
- 4-node Antelope/Spring producer cluster + history node
- Hyperion history API, Elasticsearch, RabbitMQ, MongoDB
- Redis, PostgreSQL (new database for parking)
- Docker Compose orchestration, PM2, Nginx

### New Components
- **Smart contract**: `parking.core` (deployed to `parkingcore` account)
- **Backend**: New Astro 5 SSR project at `parking/backend/`
- **Frontend**: New Next.js 16 project at `parking/frontend/`
- **Database**: New PostgreSQL database `parking`
- **Stripe**: Credit card payment processing
- **Vehicle Registry**: Integration with national registry API (with mock fallback)

---

## 2. Smart Contract — `parking.core`

Deployed to blockchain account `parkingcore`.

### Tables

#### `cities`
| Field | Type | Description |
|-------|------|-------------|
| city_id | uint64 (PK) | Auto-increment |
| admin_account | name | Blockchain account of city admin |
| city_name | string | Display name |
| currency | string | e.g. "ILS", "USD" |
| timezone | string | e.g. "Asia/Jerusalem" |
| deadline_days | uint32 | Default 90 |
| created_at | uint64 | Block timestamp |
| is_active | bool | City active flag |

**Indices:** by_admin

#### `priceopts` (price options)
| Field | Type | Description |
|-------|------|-------------|
| option_id | uint64 (PK) | Auto-increment |
| city_id | uint64 | FK to cities |
| label | string | e.g. "No parking zone", "Expired meter" |
| amount | uint32 | Price in smallest currency unit (agorot/cents) |
| is_active | bool | Option active flag |

**Indices:** by_city

#### `employees`
| Field | Type | Description |
|-------|------|-------------|
| employee_id | uint64 (PK) | Auto-increment |
| city_id | uint64 | FK to cities |
| account | name | Blockchain account |
| display_name | string | Employee full name |
| badge_number | string | Employee badge/ID |
| is_active | bool | Employment status |
| added_at | uint64 | Block timestamp |

**Indices:** by_city, by_account

#### `tickets`
| Field | Type | Description |
|-------|------|-------------|
| ticket_id | uint64 (PK) | Auto-increment |
| city_id | uint64 | FK to cities |
| employee_id | uint64 | FK to employees |
| license_plate | string | Vehicle plate number |
| location_lat | string | GPS latitude |
| location_lng | string | GPS longitude |
| location_addr | string | Human-readable address |
| option_id | uint64 | FK to priceopts |
| amount | uint32 | Snapshot of price at time of issue |
| image_count | uint32 | Number of attached images |
| status | uint8 | 0=open, 1=paid, 2=expired, 3=cancelled |
| issued_at | uint64 | Block timestamp |
| deadline_at | uint64 | Auto-calculated: issued_at + deadline_days |
| paid_at | uint64 | 0 if unpaid |
| payment_ref | string | Stripe payment ID |
| notes | string | Optional officer notes |

**Indices:** by_city, by_employee, by_plate, by_status

#### `tktimages` (ticket images — on-chain file metadata)
| Field | Type | Description |
|-------|------|-------------|
| image_id | uint64 (PK) | Auto-increment |
| ticket_id | uint64 | FK to tickets |
| uploader | name | Employee blockchain account |
| filename | string | Original filename |
| mime_type | string | e.g. "image/jpeg" |
| file_size | uint64 | Total bytes |
| file_hash | checksum256 | SHA256 of original file |
| total_chunks | uint32 | Number of 256KB chunks |
| uploaded_chunks | uint32 | Chunks uploaded so far |
| upload_complete | bool | All chunks received |
| created_at | uint64 | Block timestamp |
| completed_at | uint64 | Upload completion timestamp |

**Indices:** by_ticket, by_uploader

#### `tktchunks` (ticket image chunks — on-chain binary data)
| Field | Type | Description |
|-------|------|-------------|
| chunk_id | uint64 (PK) | Auto-increment |
| image_id | uint64 | FK to tktimages |
| uploader | name | Employee blockchain account |
| chunk_index | uint32 | 0-based index within image |
| chunk_data | string | Base64-encoded chunk (256KB) |
| chunk_size | uint32 | Raw byte size of this chunk |
| uploaded_at | uint64 | Block timestamp |

**Indices:** by_image, by_image_index (composite: image_id + chunk_index)

### Actions

| Action | Auth | Description |
|--------|------|-------------|
| `createcity` | Self (admin) | Register a new city |
| `updatecity` | City admin | Update city settings |
| `addpriceopt` | City admin | Add a pricing option |
| `rmpriceopt` | City admin | Deactivate a pricing option |
| `addemployee` | City admin | Register an employee for the city |
| `rmemployee` | City admin | Deactivate an employee |
| `issueticket` | Employee | Create a parking ticket |
| `addimage` | Employee | Create image record for a ticket (metadata) |
| `uploadchunk` | Employee | Upload a 256KB chunk of image data to chain |
| `completeimg` | Employee | Mark image upload as complete (all chunks received) |
| `payticket` | Backend service | Mark ticket as paid (with payment ref) |
| `cancelticket` | City admin | Cancel/void a ticket |
| `expireticket` | Backend service | Mark ticket as expired past deadline |

---

## 3. Database Schema (PostgreSQL — `parking` database)

### `admins`
```sql
CREATE TABLE admins (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(100) NOT NULL,
    blockchain_account VARCHAR(12) UNIQUE,
    city_id         INTEGER,                    -- NULL until city created
    email_verified  BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_login      TIMESTAMPTZ
);
```

### `employees`
```sql
CREATE TABLE employees (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(100) NOT NULL,
    badge_number    VARCHAR(50),
    blockchain_account VARCHAR(12) UNIQUE,
    city_id         INTEGER NOT NULL REFERENCES cities(id),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_login      TIMESTAMPTZ
);
```

### `cities`
```sql
CREATE TABLE cities (
    id              SERIAL PRIMARY KEY,
    blockchain_city_id BIGINT UNIQUE,
    name            VARCHAR(200) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'ILS',
    timezone        VARCHAR(50) DEFAULT 'Asia/Jerusalem',
    deadline_days   INTEGER DEFAULT 90,
    admin_id        INTEGER NOT NULL REFERENCES admins(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `sessions`
```sql
CREATE TABLE sessions (
    id              SERIAL PRIMARY KEY,
    user_type       VARCHAR(10) NOT NULL,       -- 'admin' or 'employee'
    user_id         INTEGER NOT NULL,
    token_hash      VARCHAR(64) UNIQUE NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `tickets`
```sql
CREATE TABLE tickets (
    id              SERIAL PRIMARY KEY,
    blockchain_ticket_id BIGINT UNIQUE,
    city_id         INTEGER NOT NULL REFERENCES cities(id),
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    license_plate   VARCHAR(20) NOT NULL,
    location_lat    DECIMAL(10, 7),
    location_lng    DECIMAL(10, 7),
    location_addr   VARCHAR(500),
    violation_label VARCHAR(200) NOT NULL,
    amount          INTEGER NOT NULL,            -- in smallest currency unit
    status          VARCHAR(10) DEFAULT 'open',  -- open, paid, expired, cancelled
    owner_email     VARCHAR(255),                -- from vehicle registry
    owner_name      VARCHAR(200),                -- from vehicle registry
    issued_at       TIMESTAMPTZ DEFAULT NOW(),
    deadline_at     TIMESTAMPTZ NOT NULL,
    paid_at         TIMESTAMPTZ,
    payment_ref     VARCHAR(255),                -- Stripe payment intent ID
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tickets_city ON tickets(city_id);
CREATE INDEX idx_tickets_plate ON tickets(license_plate);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_deadline ON tickets(deadline_at) WHERE status = 'open';
```

### `ticket_images`
```sql
CREATE TABLE ticket_images (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER NOT NULL REFERENCES tickets(id),
    blockchain_image_id BIGINT UNIQUE,           -- on-chain image ID
    original_filename VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    file_size       BIGINT NOT NULL,
    file_hash       VARCHAR(64) NOT NULL,        -- SHA256
    chunk_size      INTEGER DEFAULT 262144,      -- 256KB
    total_chunks    INTEGER NOT NULL,
    uploaded_chunks INTEGER DEFAULT 0,
    upload_complete BOOLEAN DEFAULT FALSE,
    temp_file_path  VARCHAR(500),                -- temp storage during chunked upload
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX idx_ticket_images_ticket ON ticket_images(ticket_id);
```

### `image_chunk_uploads`
```sql
CREATE TABLE image_chunk_uploads (
    id              SERIAL PRIMARY KEY,
    ticket_image_id INTEGER NOT NULL REFERENCES ticket_images(id),
    chunk_index     INTEGER NOT NULL,
    blockchain_tx_id VARCHAR(64),                -- transaction ID on chain
    uploaded_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ticket_image_id, chunk_index)
);
CREATE INDEX idx_image_chunks_image ON image_chunk_uploads(ticket_image_id);
```

### `payment_logs`
```sql
CREATE TABLE payment_logs (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER NOT NULL REFERENCES tickets(id),
    stripe_payment_intent VARCHAR(255) NOT NULL,
    stripe_status   VARCHAR(50) NOT NULL,
    amount          INTEGER NOT NULL,
    currency        VARCHAR(3) NOT NULL,
    payer_email     VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `vehicle_registry_cache`
```sql
CREATE TABLE vehicle_registry_cache (
    license_plate   VARCHAR(20) PRIMARY KEY,
    owner_name      VARCHAR(200),
    owner_email     VARCHAR(255),
    fetched_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL         -- cache for 24h
);
```

---

## 4. Backend API — Routes

Base path: `/api/`

### Authentication
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/admin/register` | Public | Register city admin (email + password) |
| POST | `/api/auth/admin/login` | Public | Admin login |
| POST | `/api/auth/employee/login` | Public | Employee login |
| POST | `/api/auth/verify-email` | Public | Verify email with code |
| POST | `/api/auth/logout` | Any | Terminate session |
| GET | `/api/auth/session` | Any | Get current session info |

### City Management (Admin only)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/cities` | Admin | Create city (also creates on blockchain) |
| PUT | `/api/cities/:id` | Admin | Update city settings |
| GET | `/api/cities/:id` | Admin | Get city details |
| GET | `/api/cities/:id/stats` | Admin | Dashboard statistics |

### Price Options (Admin only)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/cities/:id/prices` | Admin/Employee | List price options |
| POST | `/api/cities/:id/prices` | Admin | Add price option |
| PUT | `/api/prices/:id` | Admin | Update price option |
| DELETE | `/api/prices/:id` | Admin | Deactivate price option |

### Employee Management (Admin only)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/cities/:id/employees` | Admin | List employees |
| POST | `/api/cities/:id/employees` | Admin | Invite/add employee |
| PUT | `/api/employees/:id` | Admin | Update employee |
| DELETE | `/api/employees/:id` | Admin | Deactivate employee |

### Tickets
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/tickets` | Employee | Issue a new ticket |
| GET | `/api/tickets` | Admin/Employee | List tickets (with filters) |
| GET | `/api/tickets/:id` | Admin/Employee | Get ticket details |
| PUT | `/api/tickets/:id/cancel` | Admin | Cancel/void a ticket |

### Ticket Image Upload (chunked, on-chain — mirrors Verarta pattern)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/tickets/:id/images/init` | Employee | Initialize image upload (accepts full file, returns upload_id + total_chunks) |
| POST | `/api/tickets/:id/images/:imageId/chunk` | Employee | Upload one 256KB chunk to blockchain |
| POST | `/api/tickets/:id/images/:imageId/complete` | Employee | Mark image upload complete (verify all chunks) |
| GET | `/api/tickets/:id/images` | Admin/Employee/Public | List images for a ticket |
| GET | `/api/tickets/:id/images/:imageId` | Admin/Employee/Public | Download/reconstruct full image from chain chunks |

### Public Ticket View & Payment
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/public/tickets/:token` | Public | View ticket by secure token |
| POST | `/api/public/tickets/:token/pay` | Public | Create Stripe payment intent |
| POST | `/api/webhooks/stripe` | Stripe | Handle Stripe payment webhook |

### Vehicle Registry
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/vehicles/:plate` | Employee | Lookup vehicle owner info |

---

## 5. Frontend — Pages & Components

### Pages

```
parking/frontend/src/app/
├── layout.tsx                          # Root layout
├── page.tsx                            # Landing / marketing page
├── auth/
│   ├── admin/
│   │   ├── register/page.tsx           # Admin registration
│   │   └── login/page.tsx              # Admin login
│   └── employee/
│       └── login/page.tsx              # Employee login
├── admin/
│   ├── layout.tsx                      # Admin layout (sidebar nav)
│   ├── page.tsx                        # Dashboard (stats, recent tickets)
│   ├── setup/page.tsx                  # City setup wizard (first-time)
│   ├── employees/page.tsx              # Employee management
│   ├── prices/page.tsx                 # Price options management
│   ├── tickets/page.tsx                # All tickets list (filterable)
│   └── tickets/[id]/page.tsx           # Ticket detail view
├── employee/
│   ├── layout.tsx                      # Employee layout (mobile-first)
│   ├── page.tsx                        # Home — quick actions
│   ├── ticket/new/page.tsx             # Issue new ticket (camera, GPS, form)
│   ├── tickets/page.tsx                # My issued tickets
│   └── tickets/[id]/page.tsx           # Ticket detail
└── pay/
    └── [token]/page.tsx                # Public payment page (no auth)
```

### Key Components

```
parking/frontend/src/components/
├── layout/
│   ├── AdminSidebar.tsx                # Admin navigation
│   ├── EmployeeNav.tsx                 # Employee bottom nav (mobile)
│   └── Header.tsx                      # Top bar with user info
├── admin/
│   ├── CitySetupForm.tsx               # City configuration form
│   ├── EmployeeTable.tsx               # Employee list with actions
│   ├── PriceOptionsList.tsx            # Price tiers CRUD
│   ├── StatsCards.tsx                  # Revenue, ticket count, etc.
│   └── TicketFilters.tsx               # Date, status, plate filters
├── employee/
│   ├── TicketForm.tsx                  # New ticket form
│   ├── CameraCapture.tsx              # Camera integration for photos
│   ├── LocationPicker.tsx             # GPS + map for location
│   ├── LicensePlateInput.tsx          # Plate input with validation
│   └── PriceSelector.tsx              # Radio buttons for price options
├── tickets/
│   ├── TicketCard.tsx                  # Ticket summary card
│   ├── TicketDetail.tsx                # Full ticket view
│   ├── TicketStatusBadge.tsx           # Colored status indicator
│   └── TicketImageGallery.tsx          # Image viewer
├── payment/
│   ├── PaymentForm.tsx                 # Stripe Elements form
│   ├── PaymentSuccess.tsx              # Payment confirmation
│   └── TicketPublicView.tsx            # Public ticket info display
└── common/
    ├── DataTable.tsx                   # Reusable sortable table
    ├── Pagination.tsx                  # Pagination controls
    └── LoadingSpinner.tsx              # Loading states
```

---

## 6. Core Flows

### 6.1 City Admin Onboarding
1. Admin registers with email + password
2. Email verification (6-digit code via SMTP)
3. Admin creates city: name, currency, timezone
4. Backend creates blockchain account for admin, calls `createcity` action
5. Admin adds price options (violation types + amounts)
6. Admin invites employees (email + temp password)

### 6.2 Employee Onboarding
1. Admin creates employee in dashboard (name, email, badge number)
2. Backend creates blockchain account for employee, calls `addemployee`
3. Employee receives email with login credentials
4. Employee logs in on mobile, changes password on first login

### 6.3 Issuing a Ticket
1. Employee opens "New Ticket" on mobile device
2. GPS auto-captures location (lat/lng + reverse geocode to address)
3. Employee enters license plate number
4. Employee selects violation type (price option) from city's list
5. Employee takes at least one photo (camera API)
6. Employee adds optional notes
7. Submit:
   - Backend looks up car owner from vehicle registry (or cache)
   - Backend pushes `issueticket` action to blockchain
   - Ticket record created in PostgreSQL
   - For each image:
     a. Image saved to temp disk, SHA256 hash computed, chunk count calculated
     b. Backend pushes `addimage` action to blockchain (creates `tktimages` record)
     c. Backend uploads each 256KB chunk via `uploadchunk` action (stored in `tktchunks`)
     d. Backend pushes `completeimg` action when all chunks are on-chain
     e. Temp file deleted
   - Frontend shows upload progress bar per image (chunks completed / total)
   - Email sent to car owner with ticket details + payment link
   - Payment link is a secure token URL: `/pay/{token}`

### 6.4 Payment Flow
1. Car owner clicks payment link in email
2. Public page shows: ticket details, violation, amount, deadline, images
3. Car owner enters credit card via Stripe Elements
4. Backend creates Stripe PaymentIntent
5. On successful payment:
   - Stripe webhook fires → backend receives event
   - Backend pushes `payticket` action to blockchain
   - Ticket status updated to "paid" in PostgreSQL
   - Confirmation email sent to car owner
   - Admin dashboard updates in real-time

### 6.5 Expiration (90-day deadline)
1. Cron job runs daily (via PM2 or node-cron)
2. Queries tickets where `status = 'open' AND deadline_at < NOW()`
3. For each expired ticket:
   - Backend pushes `expireticket` action to blockchain
   - Ticket status updated to "expired" in PostgreSQL
   - Email notification sent to car owner (final notice)
   - City admin notified (can escalate to collections)

---

## 7. Image Storage (On-Chain, Chunked Upload)

Images are stored **on the blockchain** using the same chunked upload pattern as Verarta's art files. This ensures full immutability and tamper-proof evidence for every ticket photo.

### How It Works

1. **Initialize:** Employee submits image file to backend. Backend stores it temporarily on disk, computes SHA256 hash, determines chunk count (256KB per chunk), creates `tktimages` record on-chain via `addimage` action, and creates tracking row in PostgreSQL.

2. **Chunk upload:** Backend reads the temp file chunk-by-chunk and pushes each 256KB chunk to the blockchain via the `uploadchunk` action. Each chunk is base64-encoded and stored in the `tktchunks` table on-chain. The blockchain transaction ID for each chunk is recorded in `image_chunk_uploads` in PostgreSQL.

3. **Complete:** Once all chunks are uploaded, backend calls `completeimg` action which verifies `uploaded_chunks == total_chunks`, sets `upload_complete = true`, and records `completed_at`. Temp file is deleted from disk.

4. **Retrieval:** To display an image, backend (or Hyperion history API) queries all chunks for an `image_id` from the `tktchunks` table, reassembles them in order by `chunk_index`, decodes from base64, and serves the reconstructed file with the correct `Content-Type`.

### Parameters

```
Chunk size:        256KB (262,144 bytes) — matches Verarta
Max image size:    10MB (10,485,760 bytes)
Max chunks/image:  ~40
Allowed formats:   JPEG, PNG, WebP
Thumbnail:         Generated on-the-fly (or cached in Redis) at 300x300px for list views
Temp storage:      /tmp/parking-uploads/{upload_id}.{ext} (deleted after chain upload)
Cleanup:           Abandoned uploads (no activity for 1 hour) deleted by cron
```

### On-Chain vs Off-Chain Trade-offs

| Aspect | On-Chain (chosen) | Off-Chain (rejected) |
|--------|-------------------|----------------------|
| Immutability | Full — data cannot be altered | Hash only — file could be lost/corrupted |
| Legal evidence | Strongest — blockchain is timestamped ledger | Weaker — requires proving file matches hash |
| Storage cost | Higher — every byte on-chain | Lower — disk storage is cheap |
| Retrieval speed | Slower — reassemble from chunks | Faster — direct file read |
| Availability | Permanent — as long as blockchain runs | At risk — disk failure, accidental deletion |

The on-chain approach is the right fit because parking ticket images are **legal evidence** that may be used in court or appeals. Blockchain storage provides an immutable, timestamped, tamper-proof record that cannot be disputed.

---

## 8. Vehicle Registry Integration

### Interface
```typescript
interface VehicleRegistryResult {
    license_plate: string;
    owner_name: string;
    owner_email: string;
    vehicle_make?: string;
    vehicle_model?: string;
    vehicle_year?: number;
    vehicle_color?: string;
}
```

### Strategy
- **Primary:** Integrate with national vehicle registry API (Israel: Misrad HaRishuyi / gov.il API)
- **Fallback:** Admin can manually enter owner email when registry is unavailable
- **Cache:** Results cached for 24 hours in `vehicle_registry_cache` table
- **Mock mode:** For development, return mock data based on plate prefix

---

## 9. Email Templates

| Email | Trigger | Recipient | Content |
|-------|---------|-----------|---------|
| Admin Welcome | Registration | Admin | Welcome + setup instructions |
| Email Verification | Registration | Admin | 6-digit code |
| Employee Invite | Admin adds employee | Employee | Login credentials |
| Ticket Issued | Ticket created | Car owner | Ticket details + payment link + deadline |
| Payment Confirmation | Payment received | Car owner | Receipt + paid ticket summary |
| Payment Receipt (Admin) | Payment received | Admin | Notification of payment |
| Deadline Reminder | 7 days before deadline | Car owner | Reminder with payment link |
| Ticket Expired | Deadline passed | Car owner | Final notice |

---

## 10. Technology Stack Summary

| Layer | Technology | Notes |
|-------|-----------|-------|
| Blockchain | Antelope/Spring 1.2.2 | Existing cluster, new `parking.core` contract |
| Backend Framework | Astro 5 (SSR, Node adapter) | Consistent with Verarta |
| Database | PostgreSQL 16 | New `parking` database |
| Cache | Redis 8 | Session + vehicle registry cache |
| Frontend Framework | Next.js 16 (App Router) | React 19, Tailwind CSS 4 |
| State Management | Zustand 5 | Consistent with Verarta |
| Data Fetching | TanStack Query 5 | Server state management |
| Payment | Stripe (Payment Intents + Elements) | PCI-compliant credit card processing |
| Email | Nodemailer 6.9 | SMTP via existing config |
| Image Processing | Sharp | On-the-fly thumbnail generation from reconstructed chain images |
| Scheduling | node-cron | Deadline expiration job |
| Maps | Leaflet or Google Maps | Location display on tickets |
| Camera | MediaDevices API (navigator.mediaDevices) | Native browser camera access |
| Auth | Email/password + JWT | Simpler than WebAuthn for this use case |
| Validation | Zod | Shared schemas backend/frontend |

---

## 11. Project Structure

```
parking/
├── blockchain/
│   └── contracts/
│       └── parking.core/
│           ├── parking.core.cpp       # Smart contract implementation
│           ├── parking.core.hpp       # Headers and table definitions
│           └── CMakeLists.txt         # Build config
├── backend/
│   ├── src/
│   │   ├── pages/api/               # API routes (see section 4)
│   │   ├── lib/
│   │   │   ├── db.ts                # PostgreSQL connection
│   │   │   ├── redis.ts             # Redis client
│   │   │   ├── auth.ts              # JWT + password hashing
│   │   │   ├── antelope.ts          # Blockchain API client
│   │   │   ├── email.ts             # Email sending
│   │   │   ├── stripe.ts            # Stripe client
│   │   │   ├── vehicleRegistry.ts   # Vehicle lookup
│   │   │   ├── imageUpload.ts        # Chunked on-chain image upload orchestration
│   │   │   └── cron.ts              # Deadline expiration job
│   │   ├── middleware/
│   │   │   └── auth.ts              # JWT verification middleware
│   │   └── types/
│   │       └── schemas.ts           # Zod schemas
│   ├── migrations/
│   │   └── 001_initial_schema.sql   # All tables
│   ├── package.json
│   ├── astro.config.mjs
│   ├── tsconfig.json
│   └── ecosystem.config.cjs         # PM2 config
├── frontend/
│   ├── src/
│   │   ├── app/                     # Pages (see section 5)
│   │   ├── components/              # Components (see section 5)
│   │   ├── lib/
│   │   │   ├── api/                 # API client modules
│   │   │   └── utils/               # Helpers
│   │   ├── store/                   # Zustand stores
│   │   └── types/                   # TypeScript types
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
└── PARKING_TICKETS_PLAN.md          # This file
```

---

## 12. Implementation Order

### Phase 1 — Foundation
1. Set up `parking/` directory structure
2. Write and compile `parking.core` smart contract
3. Deploy contract to blockchain (new `parkingcore` account)
4. Initialize backend project (Astro 5 + Node adapter)
5. Create PostgreSQL database and run migrations
6. Implement core backend libs (db, redis, auth, antelope, email)

### Phase 2 — Admin Flow
7. Backend: Admin auth (register, verify email, login, sessions)
8. Backend: City CRUD + blockchain integration
9. Backend: Price options CRUD
10. Backend: Employee management
11. Frontend: Initialize Next.js project
12. Frontend: Admin auth pages (register, login)
13. Frontend: City setup wizard
14. Frontend: Employee management page
15. Frontend: Price options management page

### Phase 3 — Ticketing
16. Backend: Vehicle registry integration (+ mock)
17. Backend: Ticket creation endpoint + blockchain push
18. Backend: Chunked image upload — init, chunk upload to chain, complete (mirrors Verarta `fileUpload.ts`)
19. Backend: Image retrieval — reconstruct from chain chunks, serve with correct MIME type
20. Backend: Thumbnail generation (Sharp, cached in Redis)
21. Backend: Ticket listing with filters
22. Frontend: Employee login
23. Frontend: New ticket form (camera, GPS, plate, price, notes)
24. Frontend: Image upload progress UI (per-chunk progress bar)
25. Frontend: Ticket list + detail views with image gallery
26. Frontend: Admin ticket dashboard with filters

### Phase 4 — Payment & Notifications
27. Backend: Stripe integration (PaymentIntent creation)
28. Backend: Stripe webhook handler
29. Backend: Email templates (ticket issued, payment confirmation, reminders)
30. Backend: Deadline expiration cron job
31. Frontend: Public payment page (`/pay/:token`)
32. Frontend: Stripe Elements integration
33. Frontend: Payment success/failure pages

### Phase 5 — Polish & Deploy
34. Admin dashboard statistics (revenue, ticket counts, charts)
35. Mobile optimization for employee interface
36. Error handling and edge cases
37. Nginx config for `parking.verarta.com` (or custom domain)
38. PM2 ecosystem config for parking backend
39. Abandoned upload cleanup cron (temp files for incomplete chain uploads)
40. Production deployment script

---

## 13. Security Considerations

- **Payment:** All credit card handling via Stripe (PCI DSS compliant), no card data touches our servers
- **Auth:** Passwords hashed with bcrypt (cost factor 12), JWT with short expiry (24h)
- **Payment links:** Secure tokens (UUID v4 + HMAC signature), single-use prevention not needed since payments are idempotent
- **Image uploads:** File type validation (magic bytes, not just extension), 10MB size limit, stored immutably on-chain — cannot be tampered with after upload
- **Blockchain:** All ticket actions require employee/admin authentication via `require_auth()`
- **CSRF:** SameSite cookies + CSRF tokens on payment forms
- **Rate limiting:** On login attempts, ticket creation, and payment endpoints
- **Vehicle registry:** Cached to avoid excessive API calls, access logged

---

## 14. Open Questions / Decisions Needed

1. **Domain:** Separate domain (e.g., `cityparking.io`) or subdomain (`parking.verarta.com`)?
2. **Vehicle registry API:** Which national API to integrate? Need API key/contract?
3. **Multi-language:** Hebrew + English from the start, or English only initially?
4. **Late fees:** Should expired tickets incur additional fees, or just escalate to collections?
5. **Appeals:** Should car owners be able to contest a ticket through the system?
6. **Multi-city admin:** Can one admin manage multiple cities?
7. **Reporting:** What financial reports do city admins need (CSV export, charts)?
8. **SMS:** Send ticket notifications via SMS in addition to email?
