import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";

export const NANCY_PORT = Number(process.env.NANCY_BACKEND_PORT || "8765");
export const NANCY_HOST = process.env.NANCY_BACKEND_HOST || "127.0.0.1";

export function backendHttpUrl(): string {
  if (process.env.NANCY_BACKEND_URL) {
    return process.env.NANCY_BACKEND_URL.replace(/\/$/, "");
  }
  return `http://${NANCY_HOST}:${NANCY_PORT}`;
}

/** Production or explicit remote backend — never spawn Python locally. */
export function usesRemoteBackend(): boolean {
  return process.env.VERCEL_ENV === "production" || Boolean(process.env.NANCY_BACKEND_URL);
}

/** Local uv spawn is allowed only when no remote backend URL is configured. */
export function isLocalSpawnAllowed(): boolean {
  return !process.env.NANCY_BACKEND_URL;
}

/** HTTP health check against NANCY_BACKEND_URL (required when usesRemoteBackend()). */
export async function checkRemoteBackendHealth(timeoutMs = 5000): Promise<boolean> {
  const base = process.env.NANCY_BACKEND_URL?.replace(/\/$/, "");
  if (!base) {
    return false;
  }
  try {
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

const START_LOCK_MS = 30_000;

/** Resolve voice_agent dir — sibling of nancy/ by default. */
export function resolveBackendDir(): string {
  if (process.env.NANCY_BACKEND_PATH) {
    return path.resolve(process.env.NANCY_BACKEND_PATH);
  }
  return path.resolve(process.cwd(), "..", "voice_agent");
}

function logsDir(backendDir: string): string {
  const dir = path.join(backendDir, "logs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function pidFilePath(backendDir: string): string {
  return path.join(logsDir(backendDir), "nancy-server.pid");
}

function lockFilePath(backendDir: string): string {
  return path.join(logsDir(backendDir), "nancy-server.starting");
}

function spawnLogPath(backendDir: string): string {
  return path.join(logsDir(backendDir), "spawn.log");
}

export function isDevAutoStartEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.NANCY_AUTO_START !== "0";
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isPortOpen(
  port = NANCY_PORT,
  host = NANCY_HOST,
  timeoutMs = 800
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    const done = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function readPid(backendDir: string): number | null {
  try {
    const raw = fs.readFileSync(pidFilePath(backendDir), "utf8").trim();
    const pid = Number(raw);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function writePid(backendDir: string, pid: number): void {
  fs.writeFileSync(pidFilePath(backendDir), String(pid));
}

function clearPid(backendDir: string): void {
  try {
    fs.unlinkSync(pidFilePath(backendDir));
  } catch {
    /* ignore */
  }
}

function isStartLocked(backendDir: string): boolean {
  try {
    const stat = fs.statSync(lockFilePath(backendDir));
    return Date.now() - stat.mtimeMs < START_LOCK_MS;
  } catch {
    return false;
  }
}

function touchStartLock(backendDir: string): void {
  fs.writeFileSync(lockFilePath(backendDir), String(Date.now()));
}

function clearStartLock(backendDir: string): void {
  try {
    fs.unlinkSync(lockFilePath(backendDir));
  } catch {
    /* ignore */
  }
}

let spawning: Promise<ChildProcess | null> | null = null;

/**
 * Start voice_agent/main.py if not already running. Local dev only.
 * Does not keep a long-lived session — process stays up until killed or idle.
 */
export async function ensureBackendRunning(): Promise<{
  ok: boolean;
  alreadyRunning: boolean;
  started: boolean;
  error?: string;
}> {
  if (!isLocalSpawnAllowed() || usesRemoteBackend()) {
    return {
      ok: false,
      alreadyRunning: false,
      started: false,
      error: "Local backend spawn is disabled when NANCY_BACKEND_URL is set or on Vercel production.",
    };
  }

  if (!isDevAutoStartEnabled()) {
    return {
      ok: false,
      alreadyRunning: false,
      started: false,
      error: "Auto-start only runs in local development (npm run dev).",
    };
  }

  const backendDir = resolveBackendDir();
  const mainPy = path.join(backendDir, "main.py");

  if (!fs.existsSync(mainPy)) {
    return {
      ok: false,
      alreadyRunning: false,
      started: false,
      error: `Backend not found at ${backendDir}. Set NANCY_BACKEND_PATH in .env.local.`,
    };
  }

  if (await isPortOpen()) {
    return { ok: true, alreadyRunning: true, started: false };
  }

  const existingPid = readPid(backendDir);
  if (existingPid && isProcessAlive(existingPid)) {
    // Process up but port not ready yet — caller should poll
    return { ok: false, alreadyRunning: false, started: false };
  }
  if (existingPid) clearPid(backendDir);

  if (isStartLocked(backendDir)) {
    return { ok: false, alreadyRunning: false, started: false };
  }

  if (!spawning) {
    spawning = (async () => {
      touchStartLock(backendDir);
      const logFd = fs.openSync(spawnLogPath(backendDir), "a");
      fs.writeSync(
        logFd,
        `\n--- spawn ${new Date().toISOString()} ---\n`
      );

      const child = spawn("uv", ["run", "main.py"], {
        cwd: backendDir,
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: {
          ...process.env,
          HTTP_PROXY: "",
          HTTPS_PROXY: "",
          ALL_PROXY: "",
          SOCKS_PROXY: "",
        },
      });

      child.unref();
      writePid(backendDir, child.pid!);

      child.on("exit", () => {
        clearPid(backendDir);
        clearStartLock(backendDir);
      });

      return child;
    })().finally(() => {
      spawning = null;
    });
  }

  await spawning;
  return { ok: false, alreadyRunning: false, started: true };
}

export async function waitForBackend(
  maxWaitMs = 20_000,
  intervalMs = 500
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await isPortOpen()) {
      clearStartLock(resolveBackendDir());
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/** Local dev: TCP port check. Remote/Vercel: HTTP health check against NANCY_BACKEND_URL. */
export async function isBackendReachable(): Promise<boolean> {
  if (usesRemoteBackend()) {
    return checkRemoteBackendHealth(3000);
  }
  return isPortOpen();
}
