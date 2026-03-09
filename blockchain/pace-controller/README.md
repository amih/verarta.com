# Pace Controller

Pauses block production on the Verarta chain when idle, reducing resource usage and chain bloat.

## 2-State Model

- **AWAKE**: Chain produces blocks normally. Controller polls each new block for user transactions.
  After N consecutive empty blocks (default 20, ~100s), transitions to SLEEPING.

- **SLEEPING**: All 4 producers are paused. After a configurable sleep duration (default 5 min),
  producers are briefly resumed to check for pending transactions. If still idle, sleeps again.

## Wake Triggers

- **Timer expiry**: Automatic periodic wake check
- **API call**: `POST /wake` immediately wakes the chain

Any block with user transactions during an AWAKE period resets the idle counter.

## API Endpoints

| Method | Path      | Description                          |
|--------|-----------|--------------------------------------|
| GET    | `/status` | Current state, head block, idle count |
| GET    | `/health` | Health check (200 or 503)            |
| POST   | `/wake`   | Wake the chain immediately           |

## Configuration (Environment Variables)

| Variable                 | Default                    | Description                           |
|--------------------------|----------------------------|---------------------------------------|
| `PRODUCER_URLS`          | `http://localhost:8000`    | Comma-separated producer API URLs     |
| `PORT`                   | `3100`                     | HTTP server port                      |
| `IDLE_BLOCK_THRESHOLD`   | `20`                       | Empty blocks before sleeping          |
| `SLEEP_DURATION_MS`      | `300000`                   | Sleep duration in ms (5 min)          |
| `WAKE_BLOCK_COUNT`       | `20`                       | Blocks to produce during wake check   |
| `HEALTH_CHECK_INTERVAL_MS` | `30000`                  | Health check interval in ms           |

## Docker

```bash
docker compose up pace-controller
```

## Manual Wake

```bash
curl -X POST http://localhost:3100/wake
```

## Graceful Shutdown

On SIGTERM/SIGINT, the controller resumes all producers before exiting,
ensuring the chain continues producing if the controller goes down.
