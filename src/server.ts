import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { Keypair, PublicKey } from "@solana/web3.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db.js";
import { addOneCalendarMonth, classifyAgent, isHoneypotPath, randomToken, sha256 } from "./security.js";

const env = process.env;
const required = (key: string) => {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};
const port = Number(env.PORT || 8080);
const host = env.HOST || "0.0.0.0";
const publicBaseUrl = (env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, "");
const sessionSecret = required("SESSION_SECRET");
if (sessionSecret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
const adminEmail = required("ADMIN_EMAIL").toLowerCase();
const adminPasswordHash = required("ADMIN_PASSWORD_HASH");
const tokenMint = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const paymentAmount = "50.00";
const paymentAtomic = "50000000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const agentDir = path.join(rootDir, "agent");
const db = openDatabase(env.DB_PATH || "./data/godsgate.sqlite");

db.prepare("DELETE FROM honeypot_events WHERE created_at < ?").run(new Date(Date.now() - 30 * 86400000).toISOString());

const app = Fastify({
  logger: true,
  trustProxy: env.TRUST_PROXY === "true",
  bodyLimit: 256 * 1024
});

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cookie);
await app.register(jwt, {
  secret: sessionSecret,
  cookie: { cookieName: "gg_session", signed: false }
});
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
await app.register(fastifyStatic, {
  root: publicDir,
  prefix: "/",
  index: ["index.html"],
  decorateReply: true
});

const adminOnly = async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
    if (request.user?.role !== "admin") throw new Error("Invalid role");
  } catch {
    return reply.code(401).send({ error: "Autenticação administrativa necessária." });
  }
};

function issueEnrollment(agentId: string) {
  const code = randomToken(32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare("UPDATE agents SET enrollment_code_hash = ?, enrollment_expires_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(sha256(code), expiresAt, agentId);
  const enrollmentUrl = `${publicBaseUrl}/api/agent/bootstrap/${code}`;
  return {
    enrollmentUrl,
    expiresAt,
    linuxCommand: `curl -fsSL "${publicBaseUrl}/downloads/install.sh" | sudo bash -s -- "${enrollmentUrl}"`,
    windowsCommand: `iwr "${publicBaseUrl}/downloads/install.ps1" -OutFile "$env:TEMP\\godsgate-install.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\\godsgate-install.ps1" -EnrollmentUrl "${enrollmentUrl}"`
  };
}

function formatAgent(row: any) {
  const status = classifyAgent(row.last_seen_at, row.license_expires_at);
  return {
    id: row.id,
    name: row.name,
    organization: row.organization,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    lastIp: row.last_ip,
    hostname: row.hostname,
    platform: row.platform,
    arch: row.arch,
    version: row.agent_version,
    licenseExpiresAt: row.license_expires_at,
    status,
    online: status === "active",
    needsRenewal: status === "renewal_due"
  };
}

function getAgentForRequest(request: any) {
  const header = String(request.headers.authorization || "");
  const rawToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!rawToken) return null;
  return db.prepare("SELECT * FROM agents WHERE token_hash = ? AND deleted_at IS NULL").get(sha256(rawToken)) as any;
}

async function heliusRpc(method: string, params: unknown[]) {
  const endpoint = env.HELIUS_RPC_URL || (env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(env.HELIUS_API_KEY)}`
    : "");
  if (!endpoint) throw new Error("Configure HELIUS_API_KEY para verificar pagamentos.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Helius HTTP ${response.status}`);
  const payload = await response.json() as any;
  if (payload.error) throw new Error(payload.error.message || "Helius RPC error");
  return payload.result;
}

function tokenOwnerTotal(rows: any[], owner: string) {
  return (rows || []).reduce((sum: bigint, row: any) => {
    if (row.mint === tokenMint && row.owner === owner) {
      return sum + BigInt(row.uiTokenAmount?.amount || "0");
    }
    return sum;
  }, 0n);
}

async function checkPayment(paymentId: string) {
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId) as any;
  if (!payment) return { status: "not_found" };
  if (payment.status !== "pending") return { status: payment.status, signature: payment.signature };
  if (Date.parse(payment.expires_at) <= Date.now()) {
    db.prepare("UPDATE payments SET status = 'expired' WHERE id = ? AND status = 'pending'").run(paymentId);
    return { status: "expired" };
  }

  const signatures = await heliusRpc("getSignaturesForAddress", [
    payment.reference,
    { commitment: "confirmed", limit: 20 }
  ]) as any[];

  for (const item of signatures || []) {
    if (!item.signature || item.err) continue;
    const tx = await heliusRpc("getTransaction", [
      item.signature,
      { commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
    ]) as any;
    if (!tx?.meta || tx.meta.err) continue;

    const keys = tx.transaction?.message?.accountKeys || [];
    const includesReference = keys.some((key: any) =>
      (typeof key === "string" ? key : key.pubkey) === payment.reference
    );
    if (!includesReference) continue;

    const post = tokenOwnerTotal(tx.meta.postTokenBalances, payment.recipient);
    const pre = tokenOwnerTotal(tx.meta.preTokenBalances, payment.recipient);
    const received = post - pre;
    if (received < BigInt(payment.amount_atomic)) continue;

    const now = new Date();
    const agent = db.prepare("SELECT license_expires_at FROM agents WHERE id = ? AND deleted_at IS NULL").get(payment.agent_id) as any;
    const previousExpiry = agent?.license_expires_at ? Date.parse(agent.license_expires_at) : 0;
    const base = previousExpiry > now.getTime() ? new Date(previousExpiry) : now;
    const newExpiry = addOneCalendarMonth(base).toISOString();

    const confirm = db.transaction(() => {
      const changed = db.prepare("UPDATE payments SET status = 'paid', signature = ?, confirmed_at = ?, last_error = NULL WHERE id = ? AND status = 'pending'")
        .run(item.signature, now.toISOString(), paymentId).changes;
      if (changed) {
        db.prepare("UPDATE agents SET license_expires_at = ? WHERE id = ? AND deleted_at IS NULL")
          .run(newExpiry, payment.agent_id);
      }
      return changed > 0;
    });
    if (confirm()) return { status: "paid", signature: item.signature, confirmedAt: now.toISOString(), licenseExpiresAt: newExpiry };
  }
  return { status: "pending" };
}

async function createRenewalPayment(agentId: string) {
  const agent = db.prepare("SELECT id, name FROM agents WHERE id = ? AND deleted_at IS NULL").get(agentId) as any;
  if (!agent) throw new Error("Agente não encontrado.");
  const recipient = required("PAYMENT_WALLET");
  new PublicKey(recipient);
  const reference = Keypair.generate().publicKey.toBase58();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const query = new URLSearchParams({
    amount: paymentAmount,
    "spl-token": tokenMint,
    reference,
    label: "Gods Gate Defense",
    message: `Renovação ${agent.name} - ${id.slice(0, 8)}`
  });
  const solanaUrl = `solana:${recipient}?${query.toString()}`;
  const qrDataUrl = await QRCode.toDataURL(solanaUrl, { errorCorrectionLevel: "M", margin: 2, width: 320 });
  db.prepare(`
    INSERT INTO payments (id, agent_id, agent_name, amount_usdt, amount_atomic, token_mint, recipient, reference, solana_url, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(id, agentId, agent.name, paymentAmount, paymentAtomic, tokenMint, recipient, reference, solanaUrl, new Date().toISOString(), expiresAt);
  return { id, agentId, agentName: agent.name, amountUsdt: paymentAmount, mint: tokenMint, recipient, reference, solanaUrl, qrDataUrl, status: "pending", expiresAt };
}

app.get("/healthz", async () => ({ ok: true, service: "gods-gate-defense", timestamp: new Date().toISOString() }));

app.post("/api/auth/login", {
  config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
}, async (request: any, reply: any) => {
  const body = request.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  let validPassword = false;
  try {
    validPassword = await bcrypt.compare(password, adminPasswordHash);
  } catch {
    validPassword = false;
  }
  if (email !== adminEmail || !validPassword) {
    return reply.code(401).send({ error: "Credenciais inválidas." });
  }
  const token = await reply.jwtSign({ sub: adminEmail, role: "admin" }, { expiresIn: "12h" });
  reply.setCookie("gg_session", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 60 * 60
  });
  return { ok: true, email: adminEmail };
});

app.post("/api/auth/logout", async (_request: any, reply: any) => {
  reply.clearCookie("gg_session", { path: "/" });
  return { ok: true };
});

app.get("/api/auth/me", { preHandler: adminOnly }, async (request: any) => ({
  authenticated: true,
  email: request.user.sub
}));

app.get("/api/admin/overview", { preHandler: adminOnly }, async () => {
  const rows = db.prepare("SELECT * FROM agents WHERE deleted_at IS NULL ORDER BY created_at DESC").all() as any[];
  const agents = rows.map(formatAgent);
  const honeypotCount = (db.prepare("SELECT COUNT(*) AS count FROM honeypot_events WHERE created_at >= ?")
    .get(new Date(Date.now() - 86400000).toISOString()) as any).count;
  const eventCount = (db.prepare("SELECT COUNT(*) AS count FROM agent_events WHERE created_at >= ?")
    .get(new Date(Date.now() - 86400000).toISOString()) as any).count;
  return {
    stats: {
      agents: agents.length,
      active: agents.filter((agent) => agent.status === "active").length,
      renewalDue: agents.filter((agent) => agent.status === "renewal_due").length,
      offline: agents.filter((agent) => agent.status === "offline").length,
      honeypot24h: honeypotCount,
      events24h: eventCount
    },
    agents: agents.slice(0, 8),
    honeypot: db.prepare("SELECT * FROM honeypot_events ORDER BY created_at DESC LIMIT 8").all(),
    events: db.prepare("SELECT * FROM agent_events ORDER BY created_at DESC LIMIT 8").all()
  };
});

app.get("/api/admin/agents", { preHandler: adminOnly }, async () => {
  const rows = db.prepare("SELECT * FROM agents WHERE deleted_at IS NULL ORDER BY created_at DESC").all() as any[];
  return { agents: rows.map(formatAgent) };
});

app.post("/api/admin/agents", { preHandler: adminOnly }, async (request: any, reply: any) => {
  const body = request.body || {};
  const name = String(body.name || "").trim().slice(0, 80);
  const organization = String(body.organization || "").trim().slice(0, 100);
  if (!name || !organization) return reply.code(400).send({ error: "Informe o nome do agente e da organização." });
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare("INSERT INTO agents (id, name, organization, created_at) VALUES (?, ?, ?, ?)")
    .run(id, name, organization, createdAt);
  return reply.code(201).send({ agent: { id, name, organization, createdAt }, ...issueEnrollment(id) });
});

app.post("/api/admin/agents/:id/enrollment", { preHandler: adminOnly }, async (request: any, reply: any) => {
  const id = String(request.params.id);
  if (!db.prepare("SELECT id FROM agents WHERE id = ? AND deleted_at IS NULL").get(id)) {
    return reply.code(404).send({ error: "Agente não encontrado." });
  }
  return issueEnrollment(id);
});

app.delete("/api/admin/agents/:id", { preHandler: adminOnly }, async (request: any, reply: any) => {
  const result = db.prepare("DELETE FROM agents WHERE id = ?").run(String(request.params.id));
  if (!result.changes) return reply.code(404).send({ error: "Agente não encontrado." });
  return { ok: true, deleted: true };
});

app.post("/api/admin/agents/:id/renewal", { preHandler: adminOnly }, async (request: any, reply: any) => {
  try {
    return await createRenewalPayment(String(request.params.id));
  } catch (error: any) {
    return reply.code(400).send({ error: error.message || "Não foi possível gerar a cobrança." });
  }
});

app.get("/api/admin/honeypot", { preHandler: adminOnly }, async (request: any) => {
  const limit = Math.max(1, Math.min(200, Number(request.query?.limit || 100)));
  return { events: db.prepare("SELECT * FROM honeypot_events ORDER BY created_at DESC LIMIT ?").all(limit) };
});

app.get("/api/admin/events", { preHandler: adminOnly }, async (request: any) => {
  const limit = Math.max(1, Math.min(200, Number(request.query?.limit || 100)));
  return { events: db.prepare("SELECT * FROM agent_events ORDER BY created_at DESC LIMIT ?").all(limit) };
});

app.get("/api/admin/payments", { preHandler: adminOnly }, async () => ({
  payments: db.prepare("SELECT id, agent_id, agent_name, amount_usdt, status, signature, created_at, expires_at, confirmed_at FROM payments ORDER BY created_at DESC LIMIT 100").all()
}));

app.get("/api/admin/payments/:id", { preHandler: adminOnly }, async (request: any, reply: any) => {
  const id = String(request.params.id);
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(id) as any;
  if (!payment) return reply.code(404).send({ error: "Cobrança não encontrada." });
  let verification: any = { status: payment.status };
  if (payment.status === "pending") {
    try {
      verification = await checkPayment(id);
    } catch (error: any) {
      db.prepare("UPDATE payments SET last_error = ? WHERE id = ?").run(String(error.message || "Erro Helius").slice(0, 250), id);
      verification = { status: "pending", verificationAvailable: false, message: error.message || "Falha ao consultar Helius." };
    }
  }
  const updated = db.prepare("SELECT status, signature, confirmed_at, expires_at FROM payments WHERE id = ?").get(id) as any;
  return { ...updated, ...verification };
});

app.post("/api/admin/payments/:id/verify", { preHandler: adminOnly }, async (request: any, reply: any) => {
  try {
    return await checkPayment(String(request.params.id));
  } catch (error: any) {
    return reply.code(502).send({ error: error.message || "Falha na verificação pela Helius." });
  }
});

app.get("/api/agent/bootstrap/:code", async (request: any, reply: any) => {
  const code = String(request.params.code || "");
  if (code.length < 24) return reply.code(404).send({ error: "Código inválido ou expirado." });
  const agent = db.prepare("SELECT id FROM agents WHERE enrollment_code_hash = ? AND enrollment_expires_at > ? AND deleted_at IS NULL")
    .get(sha256(code), new Date().toISOString()) as any;
  if (!agent) return reply.code(404).send({ error: "Código inválido, expirado ou já utilizado." });
  const token = randomToken(40);
  const changed = db.prepare("UPDATE agents SET token_hash = ?, enrollment_code_hash = NULL, enrollment_expires_at = NULL WHERE id = ? AND enrollment_code_hash = ?")
    .run(sha256(token), agent.id, sha256(code)).changes;
  if (!changed) return reply.code(409).send({ error: "Este código já foi utilizado." });
  reply.header("cache-control", "no-store");
  return { agentId: agent.id, apiUrl: publicBaseUrl, token, heartbeatSeconds: 60 };
});

app.post("/api/agent/heartbeat", async (request: any, reply: any) => {
  const agent = getAgentForRequest(request);
  if (!agent) return reply.code(401).send({ error: "Token de agente inválido." });
  const body = request.body || {};
  const now = new Date().toISOString();
  db.prepare(`UPDATE agents SET last_seen_at = ?, last_ip = ?, hostname = ?, platform = ?, arch = ?, agent_version = ? WHERE id = ?`)
    .run(now, request.ip, String(body.hostname || "").slice(0, 120), String(body.platform || "").slice(0, 60),
      String(body.arch || "").slice(0, 40), String(body.version || "unknown").slice(0, 40), agent.id);
  const expiry = agent.license_expires_at ? Date.parse(agent.license_expires_at) : 0;
  return { ok: true, serverTime: now, licensed: expiry > Date.now(), licenseExpiresAt: agent.license_expires_at };
});

app.post("/api/agent/events", async (request: any, reply: any) => {
  const agent = getAgentForRequest(request);
  if (!agent) return reply.code(401).send({ error: "Token de agente inválido." });
  const body = request.body || {};
  const type = String(body.type || "agent");
  const severity = ["info", "low", "medium", "high", "critical"].includes(body.severity) ? body.severity : "info";
  const message = String(body.message || "Evento do agente").slice(0, 500);
  db.prepare(`INSERT INTO agent_events (id, agent_id, agent_name, event_type, severity, message, source_ip, created_at, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), agent.id, agent.name, type.slice(0, 80), severity, message, request.ip,
      new Date().toISOString(), JSON.stringify(body.details || {}).slice(0, 5000));
  return { ok: true };
});

app.get("/downloads/agent.mjs", async (_request: any, reply: any) => {
  const content = await fs.promises.readFile(path.join(agentDir, "agent.mjs"), "utf8");
  reply.type("text/javascript; charset=utf-8").header("cache-control", "public, max-age=300").send(content);
});

app.get("/downloads/install.sh", async (_request: any, reply: any) => {
  const content = await fs.promises.readFile(path.join(agentDir, "install.sh"), "utf8");
  reply.type("text/plain; charset=utf-8").send(content);
});

app.get("/downloads/install.ps1", async (_request: any, reply: any) => {
  const content = await fs.promises.readFile(path.join(agentDir, "install.ps1"), "utf8");
  reply.type("text/plain; charset=utf-8").send(content);
});

app.get("/downloads/build-ubuntu-usb.sh", async (_request: any, reply: any) => {
  const content = await fs.promises.readFile(path.join(rootDir, "usb", "build-ubuntu-iso.sh"), "utf8");
  reply.type("text/plain; charset=utf-8").send(content);
});

app.setNotFoundHandler(async (request: any, reply: any) => {
  const rawUrl = String(request.raw.url || "/");
  const pathname = new URL(rawUrl, "http://localhost").pathname;
  if (isHoneypotPath(pathname)) {
    db.prepare("INSERT INTO honeypot_events (id, source_ip, request_path, method, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), String(request.ip || "unknown").slice(0, 80), pathname.slice(0, 300),
        String(request.method || "GET").slice(0, 12), String(request.headers["user-agent"] || "").slice(0, 300),
        new Date().toISOString());
  }
  return reply.code(404).send({ error: "Not found" });
});

await app.listen({ port, host });
app.log.info("God's Gate Defense API and admin console are online.");
