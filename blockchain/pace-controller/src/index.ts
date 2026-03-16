import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { WebSocketServer, WebSocket } from "ws";
import { loadConfig, type Config } from "./config.js";
import { ProducerApi } from "./producer-api.js";

let config = loadConfig();
const producer = new ProducerApi(config.producerUrls);
const wakeEmitter = new EventEmitter();

type State = "AWAKE" | "SLOW";

let state: State = "AWAKE";
let lastProcessedBlock = 0;
let idleBlockCount = 0;
let healthy = true;
const startTime = Date.now();

// ─── Reload config from .env ───

function reloadConfig(): Config {
  const prev = config;
  config = loadConfig();
  const changes: string[] = [];
  if (prev.idleBlockThreshold !== config.idleBlockThreshold) changes.push(`idleBlockThreshold: ${prev.idleBlockThreshold} -> ${config.idleBlockThreshold}`);
  if (prev.slowIntervalMs !== config.slowIntervalMs) changes.push(`slowIntervalMs: ${prev.slowIntervalMs} -> ${config.slowIntervalMs}`);
  if (prev.slowBurstBlocks !== config.slowBurstBlocks) changes.push(`slowBurstBlocks: ${prev.slowBurstBlocks} -> ${config.slowBurstBlocks}`);
  if (prev.healthCheckIntervalMs !== config.healthCheckIntervalMs) changes.push(`healthCheckIntervalMs: ${prev.healthCheckIntervalMs} -> ${config.healthCheckIntervalMs}`);
  if (changes.length > 0) {
    console.log(`[config] Reloaded: ${changes.join(", ")}`);
  } else {
    console.log("[config] Reloaded, no changes.");
  }
  return config;
}

// ─── HTTP Server ───

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function statusPayload() {
  return {
    state,
    headBlock: lastProcessedBlock,
    idleBlockCount,
    healthy,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    config: {
      idleBlockThreshold: config.idleBlockThreshold,
      slowIntervalMs: config.slowIntervalMs,
      slowBurstBlocks: config.slowBurstBlocks,
    },
  };
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (method === "GET" && url === "/status") {
    sendJson(res, 200, statusPayload());
    return;
  }

  if (method === "GET" && url === "/health") {
    sendJson(res, healthy ? 200 : 503, { status: healthy ? "ok" : "unhealthy" });
    return;
  }

  if (method === "POST" && url === "/wake") {
    wakeEmitter.emit("wake");
    sendJson(res, 200, { ok: true, state });
    return;
  }

  if (method === "POST" && url === "/reload") {
    const updated = reloadConfig();
    sendJson(res, 200, {
      ok: true,
      config: {
        idleBlockThreshold: updated.idleBlockThreshold,
        slowIntervalMs: updated.slowIntervalMs,
        slowBurstBlocks: updated.slowBurstBlocks,
        healthCheckIntervalMs: updated.healthCheckIntervalMs,
      },
    });
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

// ─── WebSocket Server ───

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  ws.send(JSON.stringify({ type: "status", data: statusPayload() }));
});

function broadcast(type: string, data: unknown): void {
  const payload = JSON.stringify({ type, data });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// ─── Interruptible Sleep ───

function interruptibleSleep(ms: number): Promise<"timeout" | "wake"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wakeEmitter.removeListener("wake", onWake);
      resolve("timeout");
    }, ms);
    function onWake() {
      clearTimeout(timer);
      resolve("wake");
    }
    wakeEmitter.once("wake", onWake);
  });
}

// ─── Health Check ───

async function healthCheck(): Promise<void> {
  try {
    await producer.getInfo();
    healthy = true;

    // If in slow mode and a producer restarted (comes up resumed), re-assert pause
    if (state === "SLOW") {
      try {
        await producer.pause();
      } catch {
        // best effort
      }
    }
  } catch {
    healthy = false;
    console.warn("[health] Producers unreachable");
  }
}

// ─── Check blocks for user transactions ───

async function hasActivityInRange(fromBlock: number, toBlock: number): Promise<boolean> {
  for (let num = fromBlock; num <= toBlock; num++) {
    try {
      const block = await producer.getBlock(num);
      if (block.transactions.length > 0) {
        return true;
      }
    } catch {
      // Skip blocks we can't fetch
    }
  }
  return false;
}

// ─── State transition helper ───

function setState(newState: State): void {
  const prev = state;
  state = newState;
  if (prev !== newState) {
    console.log(`[main] State: ${prev} -> ${newState}`);
    broadcast("state", statusPayload());
  }
}

// ─── Main Loop ───

async function mainLoop(): Promise<void> {
  console.log(`[main] Connecting to ${config.producerUrls.length} producers: ${config.producerUrls.join(", ")}`);

  const info = await producer.getInfo();
  console.log(`[main] Connected. Chain ID: ${info.chain_id}, head block: ${info.head_block_num}`);
  lastProcessedBlock = info.head_block_num;
  state = "AWAKE";
  idleBlockCount = 0;

  console.log("[main] Starting in AWAKE mode (producers running).");
  console.log(`[main] Config: slowInterval=${config.slowIntervalMs}ms, slowBurst=${config.slowBurstBlocks} blocks, idleThreshold=${config.idleBlockThreshold} blocks`);
  broadcast("status", statusPayload());

  while (true) {
    if (state === "AWAKE") {
      await awakeTick();
    } else {
      await slowCycle();
    }
  }
}

async function awakeTick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 1000));

  let headBlock: number;
  try {
    const info = await producer.getInfo();
    headBlock = info.head_block_num;
    healthy = true;
  } catch {
    healthy = false;
    return;
  }

  // Microfork: only advance forward
  if (headBlock <= lastProcessedBlock) return;

  const prevProcessed = lastProcessedBlock;
  const newBlockCount = headBlock - prevProcessed;

  const hasActivity = await hasActivityInRange(prevProcessed + 1, headBlock);
  lastProcessedBlock = headBlock;

  if (hasActivity) {
    idleBlockCount = 0;
  } else {
    idleBlockCount += newBlockCount;
  }

  // Broadcast block update to WebSocket clients
  broadcast("block", statusPayload());

  // Transition to SLOW when idle threshold reached
  if (idleBlockCount >= config.idleBlockThreshold) {
    console.log(`[main] ${idleBlockCount} consecutive empty blocks (~1 min idle). Transitioning to SLOW.`);
    setState("SLOW");
  }
}

async function slowCycle(): Promise<void> {
  const slowSec = Math.floor(config.slowIntervalMs / 1000);
  console.log(`[main] SLOW — pausing producers. Will resume in ${slowSec}s (or on wake signal).`);

  try {
    await producer.pause();
  } catch (err) {
    console.error("[main] Failed to pause producers:", err);
  }

  broadcast("status", statusPayload());

  const result = await interruptibleSleep(config.slowIntervalMs);

  if (result === "wake") {
    console.log("[main] Wake signal received! Resuming producers.");
  } else {
    console.log(`[main] Slow interval expired. Producing burst of ${config.slowBurstBlocks} blocks to drain pending transactions...`);
  }

  // Resume producers
  try {
    await producer.resume();
  } catch (err) {
    console.error("[main] Failed to resume producers:", err);
    setState("AWAKE");
    idleBlockCount = 0;
    return;
  }

  setState("AWAKE");
  idleBlockCount = 0;

  if (result === "timeout") {
    // Wait for a burst of blocks, then check if any transactions came in.
    // If no activity: go back to SLOW. If activity: stay AWAKE.
    const burstDeadline = Date.now() + 30000;
    const startBlock = lastProcessedBlock;
    let activityFound = false;
    let burstBlocksSeen = 0;

    while (Date.now() < burstDeadline && burstBlocksSeen < config.slowBurstBlocks) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const info = await producer.getInfo();
        const headBlock = info.head_block_num;
        if (headBlock > lastProcessedBlock) {
          const hasActivity = await hasActivityInRange(lastProcessedBlock + 1, headBlock);
          burstBlocksSeen = headBlock - startBlock;
          lastProcessedBlock = headBlock;
          if (hasActivity) {
            activityFound = true;
            idleBlockCount = 0;
          }
          broadcast("block", statusPayload());
        }
      } catch {
        // retry next tick
      }
    }

    if (activityFound) {
      console.log("[main] Activity detected during burst. Staying AWAKE.");
    } else {
      console.log("[main] No activity during burst. Going back to SLOW.");
      setState("SLOW");
    }
  }
  // If result === "wake": stay AWAKE — normal awakeTick loop handles idle detection
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
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
