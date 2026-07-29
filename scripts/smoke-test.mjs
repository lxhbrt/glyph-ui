#!/usr/bin/env node
/**
 * Smoke tests: Health + WebSocket connect + Session list.
 *
 * Usage:
 *   npm run smoke              # spawn temp server (isolated)
 *   SMOKE_URL=http://127.0.0.1:5174 npm run smoke   # against running prod
 *
 * Copyright (c) 2026 Alexander Hubert — MIT License
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 15_000);

let failed = 0;

function ok(name, detail = "") {
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, err) {
  failed += 1;
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`  ✗ ${name} — ${msg}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.on("error", reject);
  });
}

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { res, body };
  } finally {
    clearTimeout(t);
  }
}

async function waitForHealth(base, attempts = 40) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const { res, body } = await fetchJson(`${base}/api/health`);
      if (res.ok && body && body.ok === true) return body;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await wait(150);
  }
  throw new Error(`health not ready: ${last}`);
}

function wsConnect(wsUrl, { origin } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, origin ? { origin } : undefined);
    let gotStatus = false;
    const timer = setTimeout(() => {
      ws.terminate();
      reject(
        new Error(
          gotStatus
            ? "WebSocket pong timeout"
            : "WebSocket status timeout",
        ),
      );
    }, TIMEOUT_MS);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === "status" && !gotStatus) {
          gotStatus = true;
          ws.send(JSON.stringify({ type: "ping" }));
        } else if (msg.type === "pong") {
          clearTimeout(timer);
          ws.close();
          resolve(msg);
        }
      } catch {
        /* ignore */
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runAgainst(base) {
  console.log(`\nSmoke → ${base}\n`);

  // 1) Health
  try {
    const { res, body } = await fetchJson(`${base}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!body || body.ok !== true) throw new Error(`unexpected body: ${JSON.stringify(body)}`);
    ok("GET /api/health", `connected=${Boolean(body.connected)}`);
  } catch (e) {
    fail("GET /api/health", e);
  }

  // 2) WebSocket (token + allowed Origin — same bar as the browser UI)
  try {
    const u = new URL(base);
    const origin = `${u.protocol}//${u.host}`;
    const { res: tokenRes, body: tokenBody } = await fetchJson(
      `${base}/api/ws-token`,
      { headers: { Origin: origin } },
    );
    if (!tokenRes.ok || !tokenBody?.token) {
      throw new Error(
        `ws-token HTTP ${tokenRes.status}: ${JSON.stringify(tokenBody)}`,
      );
    }
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${u.host}/ws?token=${encodeURIComponent(tokenBody.token)}`;
    // `ws` package: set Origin so verifyWsClient accepts the handshake
    await wsConnect(wsUrl, { origin });
    ok("WebSocket /ws", "token + status + ping/pong");
  } catch (e) {
    fail("WebSocket /ws", e);
  }

  // 3) Mutating route rejects foreign Origin (CSRF guard)
  try {
    const { res, body } = await fetchJson(`${base}/api/bridge/cancel`, {
      method: "POST",
      headers: { Origin: "https://evil.example.com" },
    });
    if (res.status !== 403) {
      throw new Error(
        `expected 403 for evil Origin, got ${res.status}: ${JSON.stringify(body)}`,
      );
    }
    ok("POST mutation rejects foreign Origin", "HTTP 403");
  } catch (e) {
    fail("POST mutation rejects foreign Origin", e);
  }

  // 4) Mutating route allows loopback without Origin (CLI / curl) —
  //    must not be blocked by the Origin guard (403). Handler may still
  //    return 4xx/5xx for other reasons (e.g. agent offline).
  try {
    const { res, body } = await fetchJson(`${base}/api/bridge/cancel`, {
      method: "POST",
    });
    if (res.status === 403) {
      throw new Error(
        `Origin guard rejected missing Origin: ${JSON.stringify(body)}`,
      );
    }
    ok("POST mutation allows no Origin", `HTTP ${res.status} (not 403)`);
  } catch (e) {
    fail("POST mutation allows no Origin", e);
  }

  // 5) Session list
  try {
    const { res, body } = await fetchJson(`${base}/api/sessions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
    if (!body || !Array.isArray(body.sessions)) {
      throw new Error(`expected sessions array, got: ${JSON.stringify(body)?.slice?.(0, 200)}`);
    }
    ok("GET /api/sessions", `count=${body.count ?? body.sessions.length}`);
  } catch (e) {
    fail("GET /api/sessions", e);
  }
}

async function spawnServer(port) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      // Avoid binding to user's long-running grok if start fails — HTTP still up
      NO_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });
  child.stdout.on("data", () => {});

  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(base);
    return { child, base, stderr: () => stderr };
  } catch (e) {
    child.kill("SIGTERM");
    const extra = stderr.trim() ? `\n--- stderr ---\n${stderr.trim().slice(-800)}` : "";
    throw new Error(`${e.message}${extra}`);
  }
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve();
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve();
    }, 2000).unref?.();
  });
}

async function main() {
  const existing = process.env.SMOKE_URL || process.env.SMOKE_BASE;
  let child = null;

  try {
    if (existing) {
      await runAgainst(existing.replace(/\/$/, ""));
    } else {
      const port = await freePort();
      console.log(`Spawning temp server on 127.0.0.1:${port} …`);
      const spawned = await spawnServer(port);
      child = spawned.child;
      await runAgainst(spawned.base);
    }
  } finally {
    await stopChild(child);
  }

  console.log();
  if (failed > 0) {
    console.error(`Smoke FAILED (${failed} check(s))`);
    process.exit(1);
  }
  console.log("Smoke OK");
  process.exit(0);
}

main().catch((err) => {
  console.error("Smoke crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
