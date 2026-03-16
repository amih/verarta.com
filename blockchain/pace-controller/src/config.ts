import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Config {
  producerUrls: string[];
  port: number;
  idleBlockThreshold: number;
  slowIntervalMs: number;
  slowBurstBlocks: number;
  healthCheckIntervalMs: number;
}

function parseEnvFile(path: string): Record<string, string> {
  const vars: Record<string, string> = {};
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
  } catch {
    // .env file is optional
  }
  return vars;
}

const ENV_FILE = resolve(process.env.ENV_FILE ?? "/app/.env");

// Merge: .env file values, then process.env overrides
function getVar(envVars: Record<string, string>, key: string, fallback: string): string {
  return process.env[key] ?? envVars[key] ?? fallback;
}

export function loadConfig(): Config {
  const envVars = parseEnvFile(ENV_FILE);
  const urlString = getVar(envVars, "PRODUCER_URLS", "http://localhost:8000");
  return {
    producerUrls: urlString.split(",").map((u) => u.trim()).filter(Boolean),
    port: parseInt(getVar(envVars, "PORT", "3100"), 10),
    idleBlockThreshold: parseInt(getVar(envVars, "IDLE_BLOCK_THRESHOLD", "12"), 10),
    slowIntervalMs: parseInt(getVar(envVars, "SLOW_INTERVAL_MS", "3600000"), 10),
    slowBurstBlocks: parseInt(getVar(envVars, "SLOW_BURST_BLOCKS", "20"), 10),
    healthCheckIntervalMs: parseInt(getVar(envVars, "HEALTH_CHECK_INTERVAL_MS", "30000"), 10),
  };
}
