import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function openDatabase(filePath: string) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      disabled_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT,
      created_at TEXT NOT NULL,
      details_json TEXT
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      organization TEXT NOT NULL,
      customer_id TEXT REFERENCES customers(id),
      token_hash TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT,
      last_ip TEXT,
      hostname TEXT,
      platform TEXT,
      arch TEXT,
      agent_version TEXT,
      license_expires_at TEXT,
      enrollment_code_hash TEXT,
      enrollment_expires_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      source_ip TEXT,
      created_at TEXT NOT NULL,
      details_json TEXT
    );
    CREATE TABLE IF NOT EXISTS honeypot_events (
      id TEXT PRIMARY KEY,
      source_ip TEXT NOT NULL,
      request_path TEXT NOT NULL,
      method TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      amount_usdt TEXT NOT NULL,
      amount_atomic TEXT NOT NULL,
      token_mint TEXT NOT NULL,
      recipient TEXT NOT NULL,
      reference TEXT NOT NULL UNIQUE,
      solana_url TEXT NOT NULL,
      status TEXT NOT NULL,
      signature TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      confirmed_at TEXT,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agents_deleted ON agents(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_events_created ON agent_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_honeypot_created ON honeypot_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_agent ON payments(agent_id);
  `);
  const agentColumns = db.pragma("table_info(agents)") as Array<{ name: string }>;
  if (!agentColumns.some((column) => column.name === "customer_id")) {
    db.exec("ALTER TABLE agents ADD COLUMN customer_id TEXT REFERENCES customers(id)");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_agents_customer ON agents(customer_id)");
  return db;
}