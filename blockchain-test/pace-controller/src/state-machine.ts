import { EventEmitter } from "node:events";
import type { Config } from "./config.js";

export enum Pace {
  SLOW = "slow",
  MEDIUM = "medium",
  FAST = "fast",
}

export type SleepResult = "timeout" | "activity";

export class StateMachine {
  pace: Pace = Pace.MEDIUM;
  lastActivityAt = 0;
  activityWindow: number[] = [];
  fastCooldownStart: number | null = null;

  private emitter = new EventEmitter();
  private config: Config;
  private pruneInterval: ReturnType<typeof setInterval>;

  constructor(config: Config) {
    this.config = config;
    // Prune old activity entries every 10 seconds
    this.pruneInterval = setInterval(() => this.pruneActivityWindow(), 10_000);
  }

  recordActivity(): void {
    const now = Date.now();
    this.lastActivityAt = now;
    this.activityWindow.push(now);
    this.emitter.emit("activity");
  }

  interruptibleSleep(ms: number): Promise<SleepResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.emitter.removeListener("activity", onActivity);
        resolve("timeout");
      }, ms);

      const onActivity = () => {
        clearTimeout(timer);
        resolve("activity");
      };

      this.emitter.once("activity", onActivity);
    });
  }

  getRecentActivityCount(): number {
    const cutoff = Date.now() - this.config.fastWindowMs;
    return this.activityWindow.filter((t) => t > cutoff).length;
  }

  isFastThresholdMet(): boolean {
    return this.getRecentActivityCount() >= this.config.fastThreshold;
  }

  checkTransitions(sleepResult: SleepResult): void {
    const now = Date.now();
    const timeSinceActivity = now - this.lastActivityAt;

    if (sleepResult === "activity") {
      if (this.pace === Pace.SLOW) {
        console.log("[pace] SLOW -> MEDIUM: activity detected");
        this.pace = Pace.MEDIUM;
      }

      if (this.isFastThresholdMet()) {
        console.log(`[pace] -> FAST: burst detected`);
        this.pace = Pace.FAST;
      }
    } else if (sleepResult === "timeout") {
      if (
        this.pace === Pace.MEDIUM &&
        timeSinceActivity > this.config.idleTimeoutMs
      ) {
        console.log("[pace] MEDIUM -> SLOW: idle for 60s");
        this.pace = Pace.SLOW;
      }
    }
  }

  checkFastCooldown(): boolean {
    const now = Date.now();
    if (!this.isFastThresholdMet()) {
      if (this.fastCooldownStart === null) {
        this.fastCooldownStart = now;
      } else if (now - this.fastCooldownStart > this.config.cooldownMs) {
        console.log("[pace] FAST -> MEDIUM: cooldown expired");
        this.pace = Pace.MEDIUM;
        this.fastCooldownStart = null;
        return true; // transitioned
      }
    } else {
      this.fastCooldownStart = null;
    }
    return false;
  }

  private pruneActivityWindow(): void {
    const cutoff = Date.now() - 60_000;
    this.activityWindow = this.activityWindow.filter((t) => t > cutoff);
  }

  destroy(): void {
    clearInterval(this.pruneInterval);
    this.emitter.removeAllListeners();
  }
}
