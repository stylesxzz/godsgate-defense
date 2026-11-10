#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const VERSION = "1.0.0";
const args = process.argv.slice(2);
const enrollIndex = args.indexOf("--enroll");
const configDir = process.platform === "win32"
  ? path.join(process.env.APPDATA || os.homedir(), "GodsGate")
  : path.join(os.homedir(), ".config", "godsgate");
const configPath = path.join(configDir, "agent.json");

async function readJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Enrollment failed: HTTP ${response.status}`);
  return response.json();
}

async function enroll(url) {
  const data = await readJson(url);
  if (!data.agentId || !data.apiUrl || !data.token) throw new Error("The server returned an incomplete enrollment response.");
  await fs.mkdir(configDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(configPath, JSON.stringify({
    agentId: data.agentId,
    apiUrl: data.apiUrl.replace(/\/$/, ""),
    token: data.token,
    heartbeatSeconds: Math.max(30, Math.min(300, Number(data.heartbeatSeconds || 60)))
  }, null, 2), { mode: 0o600 });
  console.log("God's Gate agent enrolled. Credentials were saved with restricted file permissions.");
}

async function request(config, endpoint, payload) {
  const response = await fetch(`${config.apiUrl}${endpoint}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`API request failed: HTTP ${response.status}`);
  return response.json();
}

async function run() {
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const host = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    version: VERSION
  };
  let first = true;
  let running = true;
  const stop = () => { running = false; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(`God's Gate agent started for ${config.agentId} on ${host.hostname}`);
  while (running) {
    try {
      const state = await request(config, "/api/agent/heartbeat", host);
      if (first) {
        await request(config, "/api/agent/events", {
          type: "agent.started",
          severity: "info",
          message: `Agent online: ${host.hostname}`,
          details: { platform: host.platform, arch: host.arch, version: VERSION }
        });
        first = false;
      }
      if (!state.licensed) {
        await request(config, "/api/agent/events", {
          type: "license.renewal_required",
          severity: "medium",
          message: "A licença deste agente precisa ser renovada."
        }).catch(() => {});
        console.warn("License expired or not yet activated. Heartbeat is still being reported.");
      }
    } catch (error) {
      console.error(new Date().toISOString(), error.message);
    }
    await delay((config.heartbeatSeconds || 60) * 1000);
  }
  console.log("God's Gate agent stopped.");
}

if (enrollIndex !== -1) {
  const enrollmentUrl = args[enrollIndex + 1];
  if (!enrollmentUrl) {
    console.error("Usage: node agent.mjs --enroll <one-time-enrollment-url>");
    process.exit(2);
  }
  await enroll(enrollmentUrl);
} else if (args.includes("--help")) {
  console.log("God's Gate endpoint heartbeat agent");
  console.log("Enroll: node agent.mjs --enroll <one-time-enrollment-url>");
  console.log("Run:    node agent.mjs");
} else {
  await run();
}