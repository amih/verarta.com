import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { loadConfig } from "./config.js";
import { ProducerApi, type ChainInfo } from "./producer-api.js";
import { StateMachine, Pace } from "./state-machine.js";

const config = loadConfig();
const producer = new ProducerApi(config);
const state = new StateMachine(config);

let lastKnownHeadBlockNum = 0;
let lastChainInfo: ChainInfo | null = null;
let isPaused = false;
let producing = false; // true while main loop has intentionally resumed a producer
let healthy = true;
const startTime = Date.now();

// ─── HTTP Server ───

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(data));
}

function buildStatusPayload() {
  return {
    pace: state.pace,
    paused: isPaused,
    lastActivityAt: state.lastActivityAt,
    headBlockNum: lastKnownHeadBlockNum,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    healthy,
  };
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  // Handle CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (method === "POST" && url === "/activity") {
    state.recordActivity();
    broadcast({ type: "pace", data: buildStatusPayload() });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && url === "/status") {
    sendJson(res, 200, buildStatusPayload());
    return;
  }

  if (method === "GET" && url === "/health") {
    sendJson(res, healthy ? 200 : 503, { status: healthy ? "ok" : "unhealthy" });
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

// ─── WebSocket Server ───

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  // Send current state immediately on connect
  const welcome: Record<string, unknown> = { type: "pace", data: buildStatusPayload() };
  if (lastChainInfo) {
    welcome.type = "block";
    welcome.data = { chain: lastChainInfo, pace: buildStatusPayload() };
  }
  ws.send(JSON.stringify(welcome));
});

function broadcast(message: unknown): void {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// ─── Health Check ───

async function healthCheck(): Promise<void> {
  try {
    await producer.getInfo();
    healthy = true;

    // If producer restarted, it comes up "resumed" by default.
    // Re-assert pause if we're in SLOW or MEDIUM mode, but NOT while
    // the main loop has intentionally resumed a producer to produce a block.
    if (state.pace !== Pace.FAST && !isPaused && !producing) {
      try {
        await producer.pause();
        isPaused = true;
        console.log("[health] Re-asserted pause after producer restart");
      } catch {
        // best effort
      }
    }
  } catch {
    healthy = false;
    console.warn("[health] Producer unreachable");
  }
}

// ─── Main Production Loop ───

async function ensureResumed(): Promise<void> {
  if (!isPaused) return;
  await producer.resume();
  isPaused = false;
}

async function ensurePaused(): Promise<void> {
  if (isPaused) return;
  await producer.pause();
  isPaused = true;
}

function broadcastBlock(info: ChainInfo): void {
  lastChainInfo = info;
  lastKnownHeadBlockNum = info.head_block_num;
  broadcast({ type: "block", data: { chain: info, pace: buildStatusPayload() } });
}

async function mainLoop(): Promise<void> {
  // Startup: verify connectivity
  console.log(`[main] Connecting to ${config.producerUrls.length} producers: ${config.producerUrls.join(", ")}`);
  const info = await producer.getInfo();
  console.log(`[main] Connected. Chain ID: ${info.chain_id}, head block: ${info.head_block_num}`);
  lastKnownHeadBlockNum = info.head_block_num;
  lastChainInfo = info;

  // Assert control: pause producer
  await producer.pause();
  isPaused = true;
  console.log("[main] Producers paused. Starting in MEDIUM mode.");

  while (true) {
    // ─── FAST MODE ───
    if (state.pace === Pace.FAST) {
      await ensureResumed();
      await new Promise((r) => setTimeout(r, 1000));

      // Update head block num and broadcast
      try {
        const info = await producer.getInfo();
        broadcastBlock(info);
      } catch {
        // ignore
      }

      state.checkFastCooldown();
      continue;
    }

    // ─── MEDIUM and SLOW MODES ───
    const intervalMs =
      state.pace === Pace.MEDIUM
        ? config.mediumIntervalMs
        : config.slowIntervalMs;
    const cycleStart = Date.now();

    // Step 1: Resume a single producer (round-robin rotation)
    if (!isPaused) {
      await ensurePaused();
    }
    producing = true;
    await producer.resumeOne();
    isPaused = false;

    // Step 2: Wait for a new block (use most of the interval budget)
    const waitBudget = Math.max(intervalMs - 1000, config.blockWaitTimeoutMs);
    const newBlockNum = await producer.waitForNewBlock(
      lastKnownHeadBlockNum,
      waitBudget
    );

    // Step 3: Fetch full info and broadcast
    try {
      const info = await producer.getInfo();
      broadcastBlock(info);
    } catch {
      lastKnownHeadBlockNum = newBlockNum;
    }

    // Step 4: Pause producer
    await ensurePaused();
    producing = false;

    // Step 5: Interruptible sleep for remaining interval time
    const elapsed = Date.now() - cycleStart;
    const remainingMs = Math.max(intervalMs - elapsed, 0);
    const sleepResult = remainingMs > 0
      ? await state.interruptibleSleep(remainingMs)
      : await state.interruptibleSleep(100) as "timeout";

    // Step 6: Check pace transitions
    const prevPace = state.pace;
    state.checkTransitions(sleepResult);

    // Broadcast if pace changed
    if (state.pace !== prevPace) {
      broadcast({ type: "pace", data: buildStatusPayload() });
    }

    // If we just escalated to FAST, resume immediately
    if ((state.pace as Pace) === Pace.FAST) {
      await ensureResumed();
    }
  }
}

// ─── Graceful Shutdown ───

async function shutdown(signal: string): Promise<void> {
  console.log(`[main] Received ${signal}. Resuming producers before exit...`);
  try {
    await producer.resume();
    console.log("[main] Producers resumed. Exiting.");
  } catch (err) {
    console.error("[main] Failed to resume producers on shutdown:", err);
  }
  wss.close();
  state.destroy();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Start ───

server.listen(config.port, () => {
  console.log(`[main] Pace controller listening on port ${config.port} (HTTP + WebSocket)`);
});

setInterval(() => healthCheck(), config.healthCheckIntervalMs);

mainLoop().catch((err) => {
  console.error("[main] Fatal error in main loop:", err);
  process.exit(1);
});
