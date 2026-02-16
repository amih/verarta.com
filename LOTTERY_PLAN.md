# Swertres Lottery Game — Implementation Plan

## Overview

A blockchain-backed 3-digit lottery (Swertres-style) game system for the Philippines. Reuses the existing Antelope/Spring blockchain infrastructure from Verarta. Bettors pick 3-digit numbers (000–999), optionally with "rumble" (any digit order wins), and pay via credit card. Games run 3 times daily (11 AM, 4 PM, 9 PM PST). A cron job scrapes official results and pushes them on-chain. Winners receive 450x their bet. The smart contract enforces maximum bet limits based on the license owner's deposited balance by calculating worst-case payout exposure per game.

---

## 1. Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│   Frontend       │────▶│   Backend (API)  │────▶│  Blockchain          │
│   Next.js 16     │     │   Astro 5 SSR    │     │  Antelope/Spring     │
│   React 19       │     │   Node.js 20+    │     │  (existing cluster)  │
│   Tailwind CSS 4 │     │   PostgreSQL 16  │     │  New contract:       │
│   Zustand 5      │     │   Redis 8        │     │  lottery.core        │
└──────────────────┘     └──────────────────┘     └──────────────────────┘
                               │
                   ┌───────────┼───────────┐
                   │           │           │
              ┌────▼────┐ ┌────▼───┐ ┌─────▼────────┐
              │ Stripe  │ │ Cron   │ │ PCSO Results │
              │ Payment │ │ Worker │ │ Websites     │
              │ Gateway │ │        │ │ (scraping)   │
              └─────────┘ └────────┘ └──────────────┘
```

### Shared Infrastructure (from Verarta)
- 4-node Antelope/Spring producer cluster + history node
- Hyperion history API, Elasticsearch, RabbitMQ, MongoDB
- Redis, PostgreSQL (new database for lottery)
- Docker Compose orchestration, PM2, Nginx

### New Components
- **Smart contract**: `lottery.core` (deployed to `lotterycore` account)
- **Backend**: New Astro 5 SSR project at `lottery/backend/`
- **Frontend**: New Next.js 16 project at `lottery/frontend/`
- **Database**: New PostgreSQL database `lottery`
- **Stripe**: Credit card payment processing (PHP currency)
- **Cron worker**: Node.js script for scraping PCSO results

---

## 2. Smart Contract — `lottery.core`

Deployed to blockchain account `lotterycore`.

### 2.1 Tables

#### `gameconfig` (singleton)

License owner configuration and global state.

| Field | Type | Description |
|-------|------|-------------|
| `owner` | `name` | License owner blockchain account |
| `balance` | `uint64_t` | Owner's deposited balance (centavos) |
| `total_worst_case` | `uint64_t` | Sum of max_exposure across all open games |
| `min_bet` | `uint64_t` | Minimum bet amount (default 1000 = 10.00 PHP) |
| `max_bets_per_card` | `uint8_t` | Max bet lines per card (default 10) |
| `betting_cutoff_minutes` | `uint32_t` | Minutes before game time to stop accepting bets (default 15) |
| `max_games_ahead_days` | `uint32_t` | How many days ahead bets can be placed (default 7) |
| `payout_multiplier` | `uint16_t` | Base payout multiplier (default 450) |
| `result_oracle` | `name` | Account authorized to submit game results |
| `is_active` | `bool` | Whether the system is accepting bets |

#### `games`

Scoped to contract. Each row = one draw (date + time slot).

| Field | Type | Description |
|-------|------|-------------|
| `game_id` | `uint64_t` | Primary key |
| `game_date` | `uint32_t` | Date as YYYYMMDD (e.g., 20260214) |
| `time_slot` | `uint8_t` | 0 = 11 AM, 1 = 4 PM, 2 = 9 PM PST |
| `status` | `uint8_t` | 0=scheduled, 1=betting_open, 2=betting_closed, 3=resulted, 4=cancelled |
| `winning_number` | `uint16_t` | 0–999, set after result (default 0xFFFF = no result) |
| `total_bets_count` | `uint32_t` | Number of bets placed |
| `total_bets_amount` | `uint64_t` | Sum of all bet amounts (centavos) |
| `max_exposure` | `uint64_t` | Highest exposure for any single number in this game |
| `max_exposure_number` | `uint16_t` | Which number has the max exposure |
| `total_payout` | `uint64_t` | Total payouts after result (centavos) |
| `created_at` | `uint64_t` | Timestamp |
| `resulted_at` | `uint64_t` | Timestamp of result submission |

**Secondary indices:**
- `by_date_slot` — `uint64_t`: `(game_date << 8) | time_slot` for lookups
- `by_status` — `uint64_t`: status for filtering open games

#### `bets`

Scoped to contract. Each row = one bet entry.

| Field | Type | Description |
|-------|------|-------------|
| `bet_id` | `uint64_t` | Primary key |
| `card_id` | `uint64_t` | Parent card |
| `game_id` | `uint64_t` | Which game this bet is for |
| `bettor` | `name` | Bettor's blockchain account |
| `number` | `uint16_t` | Chosen 3-digit number (0–999) |
| `amount` | `uint64_t` | Bet amount in centavos |
| `is_rumble` | `bool` | Whether rumble is active |
| `num_permutations` | `uint8_t` | 1, 3, or 6 |
| `payout_multiplier` | `uint16_t` | Effective multiplier (450, 150, or 75) |
| `status` | `uint8_t` | 0=active, 1=won, 2=lost, 3=paid, 4=refunded |
| `payout_amount` | `uint64_t` | Actual payout (0 until resulted) |
| `created_at` | `uint64_t` | Timestamp |

**Secondary indices:**
- `by_game` — `uint64_t`: game_id
- `by_bettor` — `uint64_t`: bettor.value
- `by_card` — `uint64_t`: card_id

#### `cards`

Scoped to contract. Groups bets in a single purchase.

| Field | Type | Description |
|-------|------|-------------|
| `card_id` | `uint64_t` | Primary key |
| `bettor` | `name` | Bettor's blockchain account |
| `bet_count` | `uint8_t` | Number of bet entries |
| `total_amount` | `uint64_t` | Total amount paid (centavos) |
| `status` | `uint8_t` | 0=confirmed, 1=partially_refunded, 2=fully_refunded |
| `created_at` | `uint64_t` | Timestamp |

**Secondary indices:**
- `by_bettor` — `uint64_t`: bettor.value

#### `exposures`

Scoped to contract. Tracks payout exposure per number per game.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `uint64_t` | Primary key (auto-increment) |
| `game_id` | `uint64_t` | Game reference |
| `number` | `uint16_t` | 3-digit number (0–999) |
| `total_exposure` | `uint64_t` | Total potential payout if this number wins (centavos) |
| `bet_count` | `uint32_t` | Number of bets on this number for this game |

**Secondary indices:**
- `by_game` — `uint64_t`: game_id
- `by_game_number` — `uint128_t`: `(uint128_t{game_id} << 16) | number` for exact lookup

#### `balances`

Scoped to contract. Bettor balance tracking (for winnings/withdrawals).

| Field | Type | Description |
|-------|------|-------------|
| `account` | `name` | Primary key (account.value) |
| `balance` | `uint64_t` | Available balance in centavos |
| `total_wagered` | `uint64_t` | Lifetime total wagered |
| `total_won` | `uint64_t` | Lifetime total won |
| `total_withdrawn` | `uint64_t` | Lifetime total withdrawn |

#### `skipgames`

Scoped to contract. Admin-configured game skips.

| Field | Type | Description |
|-------|------|-------------|
| `skip_id` | `uint64_t` | Primary key |
| `game_date` | `uint32_t` | Date as YYYYMMDD |
| `time_slot` | `uint8_t` | 0/1/2 for specific slot, 255 = all slots that day |
| `reason` | `std::string` | Reason (e.g., "Christmas holiday") |
| `created_at` | `uint64_t` | Timestamp |

**Secondary indices:**
- `by_date` — `uint64_t`: `(game_date << 8) | time_slot`

---

### 2.2 Actions

#### Owner / Admin Actions

```cpp
// Initialize or update game configuration
[[eosio::action]]
void initconfig(
   name owner,
   uint64_t min_bet,           // centavos (default 1000 = 10 PHP)
   uint8_t max_bets_per_card,  // default 10
   uint32_t betting_cutoff_minutes, // default 15
   uint32_t max_games_ahead_days,   // default 7
   uint16_t payout_multiplier,      // default 450
   name result_oracle          // account allowed to submit results
);

// Owner deposits funds to guarantee payouts
[[eosio::action]]
void deposit(name owner, uint64_t amount);  // centavos

// Owner withdraws funds (only if it doesn't violate exposure limits)
[[eosio::action]]
void withdraw(name owner, uint64_t amount);

// Create games for a date range (called by cron or admin)
[[eosio::action]]
void creategames(
   name authorized,       // owner or result_oracle
   uint32_t start_date,   // YYYYMMDD
   uint32_t end_date      // YYYYMMDD (inclusive)
);

// Skip/cancel future games
[[eosio::action]]
void skipgame(
   name owner,
   uint32_t game_date,    // YYYYMMDD
   uint8_t time_slot,     // 0/1/2 or 255 for all
   std::string reason
);

// Unskip a previously skipped game
[[eosio::action]]
void unskipgame(name owner, uint64_t skip_id);

// Open betting for a game (can be called by cron or admin)
[[eosio::action]]
void openbetting(name authorized, uint64_t game_id);

// Close betting for a game (called by cron before draw time)
[[eosio::action]]
void closebetting(name authorized, uint64_t game_id);

// Activate/deactivate the system
[[eosio::action]]
void setactive(name owner, bool is_active);
```

#### Betting Actions

```cpp
// Place a card with multiple bets (atomic — all or nothing)
[[eosio::action]]
void placecard(
   name bettor,
   std::vector<bet_input> bets  // see struct below
);

// Struct for bet input (not a table, used as action parameter)
struct bet_input {
   uint64_t game_id;
   uint16_t number;      // 0–999
   uint64_t amount;      // centavos
   bool is_rumble;
};
```

#### Result & Payout Actions

```cpp
// Submit game result (called by result_oracle after scraping)
[[eosio::action]]
void setresult(
   name oracle,
   uint64_t game_id,
   uint16_t winning_number   // 0–999
);

// Process payouts for a resulted game (may need multiple calls for large games)
[[eosio::action]]
void processpayout(
   name authorized,
   uint64_t game_id,
   uint32_t max_bets_to_process  // batch size to avoid CPU limits
);

// Bettor withdraws winnings from balance
[[eosio::action]]
void withdrawbal(name bettor, uint64_t amount);
```

#### Refund Actions

```cpp
// Refund all bets for a cancelled game
[[eosio::action]]
void refundgame(name authorized, uint64_t game_id);
```

---

### 2.3 Worst-Case Exposure Logic

The smart contract prevents accepting bets that would make total potential payouts exceed the owner's balance. This protects bettors by ensuring all winnings can always be paid.

#### Algorithm (inside `placecard`)

```
For each bet in the card:
  1. Calculate payout_per_number:
     - Non-rumble: amount × 450
     - Rumble: amount × (450 / num_permutations)

  2. For each number this bet creates exposure on:
     - Non-rumble: just the chosen number
     - Rumble: all permutations of the chosen digits

  3. Look up exposure record for (game_id, number)
     - If exists: new_exposure = current + payout_per_number
     - If not: new_exposure = payout_per_number

  4. If new_exposure > game.max_exposure:
     - delta = new_exposure - game.max_exposure
     - Update game.max_exposure = new_exposure
     - Update game.max_exposure_number = number
     - config.total_worst_case += delta

  5. After processing all bets:
     check(config.total_worst_case <= config.balance,
           "bets would exceed owner's payout capacity");

  6. If check fails, entire transaction rolls back (atomic)
```

#### Worst-Case Maintenance

- **On game result**: `total_worst_case -= game.max_exposure`
- **On game cancel**: `total_worst_case -= game.max_exposure` (bets refunded)
- **On owner deposit**: `balance += amount` (more room for bets)
- **On owner withdraw**: `check(balance - amount >= total_worst_case)`

#### Admin Recalculate Action

Since max_exposure is never decreased by individual bet refunds (conservative approach), an admin action `recalcexposure(game_id)` iterates all exposure records for a game and recalculates the true max. This is only needed after mass refunds.

---

### 2.4 Rumble Mechanics

Rumble means the bettor wins if the winning number is any permutation of their chosen digits.

#### Permutation Count

| Digit Pattern | Example | Permutations | Payout Multiplier |
|---------------|---------|-------------|-------------------|
| All different (A≠B≠C) | 123 | 6 | 450 ÷ 6 = **75x** |
| Two same (AAB) | 112 | 3 | 450 ÷ 3 = **150x** |
| All same (AAA) | 111 | 1 | 450 ÷ 1 = **450x** |

#### Permutation Calculation (on-chain)

```cpp
uint8_t count_permutations(uint16_t number) {
   uint8_t d0 = number / 100;
   uint8_t d1 = (number / 10) % 10;
   uint8_t d2 = number % 10;

   if (d0 == d1 && d1 == d2) return 1;       // AAA
   if (d0 == d1 || d1 == d2 || d0 == d2) return 3;  // AAB
   return 6;                                   // ABC
}
```

#### Generating Permutations (on-chain, for exposure tracking)

```cpp
std::vector<uint16_t> get_permutations(uint16_t number) {
   uint8_t d[3] = { (uint8_t)(number/100), (uint8_t)((number/10)%10), (uint8_t)(number%10) };
   std::set<uint16_t> perms;
   // Generate all 6 permutations, set deduplicates
   int idx[3] = {0,1,2};
   // All 6 orderings of 3 elements
   perms.insert(d[0]*100 + d[1]*10 + d[2]);
   perms.insert(d[0]*100 + d[2]*10 + d[1]);
   perms.insert(d[1]*100 + d[0]*10 + d[2]);
   perms.insert(d[1]*100 + d[2]*10 + d[0]);
   perms.insert(d[2]*100 + d[0]*10 + d[1]);
   perms.insert(d[2]*100 + d[1]*10 + d[0]);
   return std::vector<uint16_t>(perms.begin(), perms.end());
}
```

#### Exposure Example

Rumble bet: 10 PHP on **123** for game G:
- Permutations: {123, 132, 213, 231, 312, 321} (6 perms)
- Payout multiplier: 75x
- Exposure added to **each** of those 6 numbers: 10 × 75 = **750 PHP**
- If number 213 already had 3000 PHP exposure from other bets, it becomes 3750 PHP

---

## 3. PostgreSQL Database Schema

Database name: `lottery`

### 3.1 Tables

```sql
-- Bettor accounts
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  blockchain_account VARCHAR(13) UNIQUE NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  full_name VARCHAR(255),
  balance_centavos BIGINT DEFAULT 0,  -- cached from chain
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Games (mirror of on-chain, for fast queries)
CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  blockchain_game_id BIGINT UNIQUE NOT NULL,
  game_date DATE NOT NULL,
  time_slot SMALLINT NOT NULL CHECK (time_slot IN (0, 1, 2)),
  status SMALLINT NOT NULL DEFAULT 0,
  winning_number SMALLINT,
  total_bets_count INT DEFAULT 0,
  total_bets_amount BIGINT DEFAULT 0,
  max_exposure BIGINT DEFAULT 0,
  total_payout BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resulted_at TIMESTAMPTZ,
  UNIQUE (game_date, time_slot)
);

-- Bet cards (purchase groups)
CREATE TABLE cards (
  id SERIAL PRIMARY KEY,
  blockchain_card_id BIGINT UNIQUE,
  user_id INT REFERENCES users(id),
  bet_count SMALLINT NOT NULL,
  total_amount_centavos BIGINT NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  payment_status VARCHAR(20) DEFAULT 'pending',  -- pending, succeeded, failed, refunded
  blockchain_tx_id VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual bets (mirror of on-chain)
CREATE TABLE bets (
  id SERIAL PRIMARY KEY,
  blockchain_bet_id BIGINT UNIQUE,
  card_id INT REFERENCES cards(id),
  game_id INT REFERENCES games(id),
  user_id INT REFERENCES users(id),
  number SMALLINT NOT NULL CHECK (number BETWEEN 0 AND 999),
  amount_centavos BIGINT NOT NULL,
  is_rumble BOOLEAN DEFAULT FALSE,
  num_permutations SMALLINT NOT NULL DEFAULT 1,
  payout_multiplier SMALLINT NOT NULL DEFAULT 450,
  status VARCHAR(20) DEFAULT 'active',  -- active, won, lost, paid, refunded
  payout_amount_centavos BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exposure tracking (mirror of on-chain, for admin dashboard)
CREATE TABLE exposures (
  id SERIAL PRIMARY KEY,
  game_id INT REFERENCES games(id),
  number SMALLINT NOT NULL CHECK (number BETWEEN 0 AND 999),
  total_exposure_centavos BIGINT DEFAULT 0,
  bet_count INT DEFAULT 0,
  UNIQUE (game_id, number)
);

-- Game skips
CREATE TABLE game_skips (
  id SERIAL PRIMARY KEY,
  game_date DATE NOT NULL,
  time_slot SMALLINT,  -- NULL = all slots
  reason TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Result scrape logs
CREATE TABLE result_scrape_logs (
  id SERIAL PRIMARY KEY,
  game_id INT REFERENCES games(id),
  source_url TEXT,
  raw_response TEXT,
  winning_number SMALLINT,
  status VARCHAR(20),  -- success, failed, mismatch
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Withdrawal requests
CREATE TABLE withdrawals (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  amount_centavos BIGINT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, processed, rejected
  bank_name VARCHAR(100),
  account_number VARCHAR(50),
  account_name VARCHAR(255),
  blockchain_tx_id VARCHAR(64),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Owner deposits/withdrawals ledger
CREATE TABLE owner_transactions (
  id SERIAL PRIMARY KEY,
  transaction_type VARCHAR(20) NOT NULL,  -- deposit, withdrawal, payout
  amount_centavos BIGINT NOT NULL,
  balance_after_centavos BIGINT NOT NULL,
  reference TEXT,
  blockchain_tx_id VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Key Indices

```sql
CREATE INDEX idx_games_date_status ON games(game_date, status);
CREATE INDEX idx_bets_game ON bets(game_id);
CREATE INDEX idx_bets_user ON bets(user_id);
CREATE INDEX idx_bets_card ON bets(card_id);
CREATE INDEX idx_bets_status ON bets(status);
CREATE INDEX idx_cards_user ON cards(user_id);
CREATE INDEX idx_exposures_game ON exposures(game_id);
CREATE INDEX idx_exposures_game_number ON exposures(game_id, number);
```

---

## 4. Backend API Routes (Astro 5 SSR)

Base path: `/api`

### 4.1 Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register new bettor (email, phone, name) |
| POST | `/auth/login` | Login (email + OTP or phone + OTP) |
| POST | `/auth/verify-otp` | Verify OTP code |
| GET | `/auth/me` | Get current user profile |

### 4.2 Games

| Method | Path | Description |
|--------|------|-------------|
| GET | `/games` | List upcoming games (with skip status) |
| GET | `/games/:id` | Get single game details |
| GET | `/games/:id/results` | Get game result + winning bets |
| GET | `/games/schedule` | Get full schedule for next N days |

### 4.3 Betting

| Method | Path | Description |
|--------|------|-------------|
| POST | `/bets/validate` | Validate a card before payment (check limits, exposure) |
| POST | `/bets/place` | Create payment intent + place card on-chain after payment |
| GET | `/bets/my-cards` | List current user's cards |
| GET | `/bets/my-cards/:id` | Get card details with all bets |
| GET | `/bets/my-bets` | List current user's bets (filterable by status, game) |
| GET | `/bets/my-bets/:id` | Get single bet details |

### 4.4 Balance & Withdrawals

| Method | Path | Description |
|--------|------|-------------|
| GET | `/balance` | Get current user's balance |
| GET | `/balance/history` | Get balance transaction history |
| POST | `/withdrawals/request` | Request withdrawal to bank account |
| GET | `/withdrawals` | List user's withdrawal requests |

### 4.5 Payments (Stripe Webhooks)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/stripe` | Handle Stripe payment events |

### 4.6 Admin Routes (require admin role)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/dashboard` | Aggregated stats (total bets, exposure, balance) |
| GET | `/admin/games` | List all games with stats |
| GET | `/admin/games/:id/exposure` | Exposure breakdown per number for a game |
| GET | `/admin/games/:id/bets` | All bets for a game |
| POST | `/admin/games/create` | Create games for date range |
| POST | `/admin/games/:id/skip` | Skip a game |
| DELETE | `/admin/games/skips/:id` | Remove a skip |
| POST | `/admin/games/:id/open-betting` | Manually open betting |
| POST | `/admin/games/:id/close-betting` | Manually close betting |
| GET | `/admin/owner/balance` | Owner balance and exposure summary |
| POST | `/admin/owner/deposit` | Record owner deposit |
| POST | `/admin/owner/withdraw` | Record owner withdrawal |
| GET | `/admin/bettors` | List bettors with stats |
| GET | `/admin/bettors/:id` | Single bettor detail |
| GET | `/admin/withdrawals` | List pending withdrawal requests |
| POST | `/admin/withdrawals/:id/approve` | Approve withdrawal |
| POST | `/admin/withdrawals/:id/reject` | Reject withdrawal |
| GET | `/admin/results/logs` | Scrape log history |
| POST | `/admin/results/:game_id/manual` | Manually enter a result |
| POST | `/admin/config` | Update game configuration |
| POST | `/admin/recalculate-exposure/:game_id` | Recalculate max exposure for a game |

---

## 5. Frontend Pages & Components (Next.js 16)

### 5.1 Public / Bettor Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Landing page with next draw countdown, quick bet |
| `/login` | Login | Email/phone OTP login |
| `/register` | Register | New user registration |
| `/games` | Game Schedule | Calendar view of upcoming games |
| `/bet` | Place Bet | Main betting interface (number picker, rumble toggle, game selector) |
| `/bet/confirm` | Confirm Card | Review card, see total, pay via Stripe |
| `/bet/success` | Bet Placed | Confirmation with card details |
| `/my-bets` | My Bets | List of all bets (active, won, lost) with filters |
| `/my-bets/:cardId` | Card Detail | All bets in a card with statuses |
| `/results` | Results | Past game results with search |
| `/results/:gameId` | Game Result | Winning number, payout stats |
| `/wallet` | Wallet | Balance, winnings, withdrawal requests |
| `/wallet/withdraw` | Withdraw | Bank transfer withdrawal form |

### 5.2 Admin Pages

| Route | Page | Description |
|-------|------|-------------|
| `/admin` | Dashboard | Overview: today's games, total exposure, owner balance, active bets |
| `/admin/games` | Game Management | List all games, create new, skip/unskip |
| `/admin/games/:id` | Game Detail | Bets list, exposure chart (bar chart of top-exposed numbers) |
| `/admin/exposure` | Exposure Matrix | Heatmap/table of exposure per number across open games |
| `/admin/bettors` | Bettors | Bettor list with lifetime stats |
| `/admin/withdrawals` | Withdrawals | Pending withdrawal requests, approve/reject |
| `/admin/finance` | Finance | Owner balance, deposit/withdrawal ledger, payout history |
| `/admin/config` | Settings | System configuration (min bet, cutoff, oracle, etc.) |
| `/admin/results` | Result Logs | Scrape history, manual result entry |
| `/admin/schedule` | Schedule | Calendar view with skip management |

### 5.3 Key Components

```
components/
├── betting/
│   ├── NumberPicker.tsx       -- 3-digit input with keypad or scroll wheels
│   ├── RumbleToggle.tsx       -- Toggle switch with permutation preview
│   ├── GameSelector.tsx       -- Multi-select upcoming games (checkbox list)
│   ├── BetLine.tsx            -- Single bet line (number + amount + rumble + games)
│   ├── CardBuilder.tsx        -- Add up to 10 bet lines, shows total
│   └── CardSummary.tsx        -- Review card before payment
├── results/
│   ├── DrawCountdown.tsx      -- Countdown timer to next draw
│   ├── WinningNumber.tsx      -- Big 3-digit display with animation
│   └── ResultHistory.tsx      -- Past results table/list
├── wallet/
│   ├── BalanceDisplay.tsx     -- Balance with PHP formatting
│   ├── TransactionList.tsx    -- Bet/win/withdrawal history
│   └── WithdrawForm.tsx       -- Bank details + amount
├── admin/
│   ├── ExposureChart.tsx      -- Bar chart of top-exposed numbers
│   ├── ExposureHeatmap.tsx    -- Grid heatmap (numbers vs games)
│   ├── GameCalendar.tsx       -- Calendar with game status indicators
│   ├── BettorStats.tsx        -- Bettor summary cards
│   └── FinanceLedger.tsx      -- Owner transaction table
└── shared/
    ├── PhpAmount.tsx          -- Format centavos to PHP display (₱)
    ├── GameBadge.tsx          -- Game status badge (open, closed, resulted, etc.)
    └── NumberDisplay.tsx      -- 3-digit display with leading zeros (e.g., "007")
```

---

## 6. Core Flows

### 6.1 Placing a Bet

```
Bettor                Frontend              Backend               Blockchain
  │                     │                     │                      │
  │  Pick numbers,      │                     │                      │
  │  toggle rumble,     │                     │                      │
  │  select games       │                     │                      │
  │────────────────────▶│                     │                      │
  │                     │  POST /bets/validate│                      │
  │                     │────────────────────▶│                      │
  │                     │                     │  Check: games open,  │
  │                     │                     │  amounts valid,      │
  │                     │                     │  exposure ok         │
  │                     │  { valid, total }   │                      │
  │                     │◀────────────────────│                      │
  │  Confirm & pay      │                     │                      │
  │────────────────────▶│                     │                      │
  │                     │  POST /bets/place   │                      │
  │                     │────────────────────▶│                      │
  │                     │                     │  Create Stripe       │
  │                     │                     │  PaymentIntent (PHP) │
  │                     │  { clientSecret }   │                      │
  │                     │◀────────────────────│                      │
  │  Stripe Elements    │                     │                      │
  │  card payment       │                     │                      │
  │────────────────────▶│                     │                      │
  │                     │         Stripe webhook: payment_succeeded  │
  │                     │                     │◀─── Stripe ──────────│
  │                     │                     │                      │
  │                     │                     │  placecard(bettor,   │
  │                     │                     │    bets[])           │
  │                     │                     │─────────────────────▶│
  │                     │                     │                      │  Validate each bet
  │                     │                     │                      │  Update exposures
  │                     │                     │                      │  Check worst-case
  │                     │                     │  tx confirmed        │  vs owner balance
  │                     │                     │◀─────────────────────│
  │                     │                     │                      │
  │                     │                     │  Save to PostgreSQL  │
  │                     │  { card, bets }     │                      │
  │                     │◀────────────────────│                      │
  │  Show confirmation  │                     │                      │
  │◀────────────────────│                     │                      │
```

### 6.2 Game Result Flow

```
Cron Worker                Backend               Blockchain
  │                          │                      │
  │  (runs at 11:15, 4:15,   │                      │
  │   9:15 PST)              │                      │
  │                          │                      │
  │  Scrape PCSO results     │                      │
  │  from multiple sources   │                      │
  │─────────────────────────▶                       │
  │                          │                      │
  │  Verify: ≥2 sources      │                      │
  │  agree on same number    │                      │
  │                          │                      │
  │                          │  setresult(oracle,   │
  │                          │    game_id, number)  │
  │                          │─────────────────────▶│
  │                          │                      │  Store winning_number
  │                          │                      │  status = resulted
  │                          │  tx confirmed        │
  │                          │◀─────────────────────│
  │                          │                      │
  │                          │  processpayout(      │
  │                          │    game_id, batch)   │
  │                          │─────────────────────▶│  (may call multiple
  │                          │                      │   times for batching)
  │                          │                      │
  │                          │                      │  For each bet:
  │                          │                      │   - Check if won
  │                          │                      │   - Credit balance
  │                          │                      │   - Debit owner
  │                          │                      │   - Update status
  │                          │  tx confirmed        │
  │                          │◀─────────────────────│
  │                          │                      │
  │                          │  Update PostgreSQL   │
  │                          │  (games, bets, users)│
  │                          │                      │
  │  Log scrape result       │                      │
  │                          │                      │
```

### 6.3 Bet Winning Check Logic

For each bet when game results come in:

**Non-rumble bet**: bet wins if `bet.number == winning_number`

**Rumble bet**: bet wins if `winning_number` is any permutation of `bet.number`:
```
Sort digits of bet.number → sorted_bet
Sort digits of winning_number → sorted_winning
Win if sorted_bet == sorted_winning
```

### 6.4 Game Scheduling Flow

```
Daily Cron (midnight PST)      Backend               Blockchain
  │                              │                      │
  │  Create games for day        │                      │
  │  = today + max_games_ahead   │                      │
  │─────────────────────────────▶                       │
  │                              │  Check skip list     │
  │                              │                      │
  │                              │  creategames(        │
  │                              │    authorized,       │
  │                              │    start, end)       │
  │                              │─────────────────────▶│  Skips games on
  │                              │                      │  skip list
  │                              │                      │  Creates 0-3 games
  │                              │  Mirror to Postgres  │  per date
  │                              │                      │
```

---

## 7. Cron Job — Results Scraping

### 7.1 Schedule

| PST Time | UTC Time | Action |
|-----------|----------|--------|
| 12:00 AM | 4:00 PM (prev day) | Create games for future dates |
| 10:45 AM | 2:45 AM | Close betting for 11 AM game |
| 11:15 AM | 3:15 AM | Scrape 11 AM result |
| 3:45 PM | 7:45 AM | Close betting for 4 PM game |
| 4:15 PM | 8:15 AM | Scrape 4 PM result |
| 8:45 PM | 12:45 PM | Close betting for 9 PM game |
| 9:15 PM | 1:15 PM | Scrape 9 PM result |

### 7.2 Scraping Sources

Primary sources (at least 2 must agree):
1. **PCSO Official** — `https://www.pcso.gov.ph/SearchLottoResult.aspx`
2. **Philippine Lotto Results** — popular aggregator sites
3. **PCSO Lotto Results** — secondary aggregator

### 7.3 Scraping Strategy

```typescript
interface ScrapeResult {
  source: string;
  winning_number: number;  // 0-999
  game_date: string;       // YYYY-MM-DD
  time_slot: number;       // 0, 1, 2
  raw_html: string;
}

async function scrapeResults(gameDate: string, timeSlot: number): Promise<number> {
  const results = await Promise.allSettled([
    scrapePCSO(gameDate, timeSlot),
    scrapeSource2(gameDate, timeSlot),
    scrapeSource3(gameDate, timeSlot),
  ]);

  const successful = results.filter(r => r.status === 'fulfilled')
                            .map(r => r.value);

  // Require at least 2 matching results
  const consensus = findConsensus(successful);
  if (!consensus) {
    throw new Error('No consensus on winning number — manual entry required');
  }

  return consensus.winning_number;
}
```

### 7.4 Retry Logic

- If scraping fails: retry every 5 minutes for 30 minutes
- If still no result after 30 minutes: alert admin for manual entry
- Admin can enter result manually via `/admin/results/:game_id/manual`

---

## 8. Payment Flow (Stripe)

### 8.1 Stripe Configuration

- **Currency**: `php` (Philippine Peso)
- **Payment methods**: Cards (Visa, Mastercard), GCash (if available via Stripe PH)
- **Minimum charge**: ₱10.00 (Stripe PH minimum)

### 8.2 Flow

1. **Frontend**: Bettor builds card → clicks "Pay"
2. **Backend**: `POST /bets/place`
   - Validate all bets (games open, amounts valid, within exposure limits)
   - Create Stripe PaymentIntent with `amount` (total in centavos) and `currency: 'php'`
   - Store card record with `payment_status: 'pending'`
   - Return `clientSecret` to frontend
3. **Frontend**: Use Stripe Elements to collect card details and confirm payment
4. **Stripe Webhook**: `payment_intent.succeeded`
   - Backend receives webhook
   - Submit `placecard` to blockchain
   - If blockchain rejects (exposure exceeded): refund Stripe payment, mark card as `refunded`
   - If blockchain succeeds: update card `payment_status: 'succeeded'`, store blockchain tx ID
5. **Stripe Webhook**: `payment_intent.payment_failed`
   - Mark card as `failed`, do not submit to blockchain

### 8.3 Refunds

- **Game cancelled**: Automatic Stripe refund + blockchain `refundgame`
- **System error**: Manual refund via admin panel

---

## 9. Game Scheduling

### 9.1 Time Slots

| Slot ID | Local Time (PST/UTC+8) | UTC | Description |
|---------|------------------------|-----|-------------|
| 0 | 11:00 AM | 3:00 AM | Morning draw |
| 1 | 4:00 PM | 8:00 AM | Afternoon draw |
| 2 | 9:00 PM | 1:00 PM | Evening draw |

### 9.2 Betting Windows

- Betting opens: immediately after the previous game results (or when game is created)
- Betting closes: `betting_cutoff_minutes` before draw time (default 15 min)
- Example: For 11 AM draw, betting closes at 10:45 AM PST

### 9.3 Skip Management

Admin can skip future games for:
- National holidays (Christmas, New Year, Holy Week)
- Bad weather / typhoons
- PCSO-announced suspensions
- Any other reason

Skip granularity:
- **Single slot**: e.g., skip December 25, 11 AM only
- **Full day**: e.g., skip all 3 slots on December 25 (`time_slot = 255`)

When a game is skipped:
1. Game status → `cancelled`
2. All bets for that game → `refunded`
3. Bettor balances credited OR Stripe refunds issued
4. Owner's `total_worst_case` reduced by game's `max_exposure`

---

## 10. Admin Dashboard

### 10.1 Main Dashboard

Displays at a glance:
- **Today's Games**: 3 games with status (upcoming/live/resulted), winning numbers
- **Owner Balance**: current balance in PHP
- **Total Worst-Case Exposure**: sum across all open games
- **Available Capacity**: balance - worst_case (how much more can be bet)
- **Active Bets**: count + total amount
- **Today's Revenue**: total bets placed today
- **Today's Payouts**: total payouts today

### 10.2 Exposure View

The key admin feature — aggregated bets per digit combination:

**Per-Game Exposure Table:**
| Number | Bets | Total Wagered | Potential Payout | % of Max |
|--------|------|---------------|------------------|----------|
| 123 | 45 | ₱12,500 | ₱562,500 | 100% (max) |
| 456 | 38 | ₱9,200 | ₱414,000 | 73.6% |
| 789 | 31 | ₱7,800 | ₱351,000 | 62.4% |
| ... | ... | ... | ... | ... |

**Cross-Game Exposure Heatmap:**
Visual grid showing exposure intensity across all open games, with the highest-exposure numbers highlighted in red.

### 10.3 Finance Panel

- Owner balance over time chart
- Deposit/withdrawal history
- Payout history per game
- Profit/loss per day, week, month

---

## 11. Tech Stack

| Component | Technology |
|-----------|------------|
| Blockchain | Antelope/Spring v1.2.2 (existing cluster) |
| Smart Contract | C++ (eosio.hpp), compiled to WASM |
| Backend | Astro 5 SSR, Node.js 20+, TypeScript |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| State Management | Zustand 5 |
| Database | PostgreSQL 16 |
| Cache | Redis 8 |
| Payments | Stripe (PHP currency) |
| Blockchain SDK | @wharfkit/antelope |
| Cron Jobs | node-cron or PM2 cron |
| Scraping | Cheerio + fetch (for PCSO results) |
| Charts | Recharts or Chart.js (for admin dashboard) |
| OTP Auth | Email/SMS OTP (Resend for email, Semaphore for PH SMS) |
| Process Manager | PM2 |
| Deployment | Docker Compose + Nginx |

---

## 12. Project Structure

```
lottery/
├── blockchain/
│   └── contracts/
│       └── lottery.core/
│           ├── lottery.core.hpp
│           ├── lottery.core.cpp
│           └── CMakeLists.txt
├── backend/
│   ├── astro.config.mjs
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── pages/
│       │   └── api/
│       │       ├── auth/
│       │       │   ├── register.ts
│       │       │   ├── login.ts
│       │       │   ├── verify-otp.ts
│       │       │   └── me.ts
│       │       ├── games/
│       │       │   ├── index.ts
│       │       │   ├── [id].ts
│       │       │   └── schedule.ts
│       │       ├── bets/
│       │       │   ├── validate.ts
│       │       │   ├── place.ts
│       │       │   ├── my-cards.ts
│       │       │   └── my-bets.ts
│       │       ├── balance/
│       │       │   ├── index.ts
│       │       │   └── history.ts
│       │       ├── withdrawals/
│       │       │   ├── request.ts
│       │       │   └── index.ts
│       │       ├── webhooks/
│       │       │   └── stripe.ts
│       │       └── admin/
│       │           ├── dashboard.ts
│       │           ├── games/
│       │           ├── exposure/
│       │           ├── owner/
│       │           ├── bettors/
│       │           ├── withdrawals/
│       │           ├── results/
│       │           └── config.ts
│       └── lib/
│           ├── blockchain.ts      -- Antelope/Wharfkit helpers
│           ├── db.ts              -- PostgreSQL connection pool
│           ├── redis.ts           -- Redis client
│           ├── stripe.ts          -- Stripe client config
│           ├── auth.ts            -- OTP + JWT auth helpers
│           ├── scraper.ts         -- PCSO results scraper
│           ├── permutations.ts    -- Rumble permutation utilities
│           ├── exposure.ts        -- Exposure calculation helpers
│           └── cron.ts            -- Cron job definitions
├── frontend/
│   ├── next.config.mjs
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx              -- Home
│       │   ├── login/
│       │   ├── register/
│       │   ├── games/
│       │   ├── bet/
│       │   │   ├── page.tsx          -- Bet builder
│       │   │   ├── confirm/
│       │   │   └── success/
│       │   ├── my-bets/
│       │   │   ├── page.tsx
│       │   │   └── [cardId]/
│       │   ├── results/
│       │   │   ├── page.tsx
│       │   │   └── [gameId]/
│       │   ├── wallet/
│       │   │   ├── page.tsx
│       │   │   └── withdraw/
│       │   └── admin/
│       │       ├── page.tsx          -- Dashboard
│       │       ├── games/
│       │       ├── exposure/
│       │       ├── bettors/
│       │       ├── withdrawals/
│       │       ├── finance/
│       │       ├── results/
│       │       ├── schedule/
│       │       └── config/
│       ├── components/
│       │   ├── betting/
│       │   ├── results/
│       │   ├── wallet/
│       │   ├── admin/
│       │   └── shared/
│       ├── lib/
│       │   ├── api.ts              -- Backend API client
│       │   └── format.ts           -- PHP currency formatting
│       ├── store/
│       │   ├── authStore.ts
│       │   ├── betStore.ts         -- Card builder state
│       │   └── gameStore.ts
│       └── types/
│           ├── game.ts
│           ├── bet.ts
│           └── user.ts
├── docker-compose.yml
├── ecosystem.config.cjs             -- PM2 config
└── LOTTERY_PLAN.md
```

---

## 13. Implementation Phases

### Phase 1 — Smart Contract + Core Backend (Week 1–2)

1. Write `lottery.core.hpp` with all table and action declarations
2. Implement `lottery.core.cpp`:
   - `initconfig`, `deposit`, `withdraw`
   - `creategames`, `skipgame`, `unskipgame`
   - `placecard` with full exposure checking and rumble logic
   - `openbetting`, `closebetting`
   - `setresult`, `processpayout`
   - `withdrawbal`, `refundgame`
3. Write contract unit tests (using EOSIO test framework)
4. Deploy contract to test blockchain
5. Set up PostgreSQL database with migrations
6. Implement backend auth (OTP login via email/SMS)
7. Implement game CRUD API routes
8. Implement blockchain interaction helpers (`lib/blockchain.ts`)

### Phase 2 — Betting + Payments (Week 2–3)

1. Implement betting validation and placement API
2. Set up Stripe integration (PHP currency, payment intents)
3. Implement Stripe webhook handler
4. Implement bet placement flow (payment → blockchain → database)
5. Build frontend: login, registration
6. Build frontend: number picker, rumble toggle, game selector
7. Build frontend: card builder with up to 10 lines
8. Build frontend: Stripe Elements payment form
9. Build frontend: bet confirmation and success pages

### Phase 3 — Results + Payouts (Week 3–4)

1. Implement PCSO results scraper with multi-source verification
2. Set up cron jobs: game creation, betting open/close, result scraping
3. Implement `setresult` and `processpayout` backend calls
4. Implement payout crediting to bettor balances
5. Build frontend: results pages (live results, history)
6. Build frontend: wallet/balance page
7. Implement withdrawal request flow
8. Build frontend: my-bets page with status tracking

### Phase 4 — Admin Dashboard (Week 4–5)

1. Build admin dashboard overview page
2. Build exposure table and heatmap components
3. Build game management pages (create, skip, manual result)
4. Build finance panel (owner balance, deposits, payouts)
5. Build bettor management page
6. Build withdrawal approval interface
7. Build configuration page

### Phase 5 — Testing, Polish, Deploy (Week 5–6)

1. End-to-end testing: full bet → result → payout cycle
2. Load testing: exposure calculation with many concurrent bets
3. Security audit: payment flow, blockchain transactions, auth
4. UI polish: responsive design, loading states, error handling
5. Set up production Docker Compose with Nginx
6. Configure PM2 ecosystem for all services
7. Deploy to production blockchain
8. Go live with limited beta testing

---

## 14. Security Considerations

- **Payment security**: All Stripe operations server-side, webhook signature verification
- **Blockchain atomicity**: `placecard` action is atomic — all bets pass or all fail
- **Exposure integrity**: Worst-case tracked on-chain, cannot be bypassed
- **Result oracle**: Only the designated `result_oracle` account can submit results
- **Double-spend prevention**: Bets only placed after Stripe payment confirmed
- **Refund safety**: Blockchain refunds only for cancelled games, not failed bets
- **Admin auth**: Separate admin role, not just any logged-in user
- **Rate limiting**: Redis-based rate limiting on betting API
- **Input validation**: Number must be 0–999, amount must be ≥ min_bet, rumble validated on-chain
- **Withdrawal limits**: Daily/monthly withdrawal limits to prevent fraud
- **Audit trail**: All blockchain transactions immutable, scrape logs stored

---

## 15. Open Questions

1. **KYC Requirements**: Philippines gambling regulations may require identity verification. Need to determine if KYC is needed before accepting bets.
2. **PAGCOR Licensing**: The system operates under a license — what specific reporting requirements does PAGCOR mandate?
3. **GCash Integration**: Should we support GCash payments via Stripe or directly? GCash is the most popular payment method in the Philippines.
4. **SMS Provider**: Which SMS provider for OTP in the Philippines? Options: Semaphore, Vonage, Twilio.
5. **Result Source Reliability**: Need to test PCSO website scraping reliability. May need backup sources or API providers.
6. **Withdrawal Method**: Bank transfer, GCash, or both? Processing time expectations.
7. **Multi-currency Support**: Only PHP for now, but should the contract support other currencies in the future?
8. **Maximum Bet Cap**: Besides the exposure limit, should there be a hard per-bet maximum (e.g., ₱10,000)?
9. **Winning Notifications**: Email/SMS notification when a bettor wins?
10. **Historical Data**: How far back should results history be stored/displayed?
