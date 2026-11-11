import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "./db.js";

test("database creates customer tenancy and supports isolated agent ownership", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "godsgate-db-"));
  const file = path.join(directory, "test.sqlite");
  const db = openDatabase(file);
  try {
    const customerColumns = db.pragma("table_info(customers)") as Array<{ name: string }>;
    const agentColumns = db.pragma("table_info(agents)") as Array<{ name: string }>;
    assert.ok(customerColumns.some((column) => column.name === "password_hash"));
    assert.ok(agentColumns.some((column) => column.name === "customer_id"));

    db.prepare("INSERT INTO customers (id,email,password_hash,display_name,created_at) VALUES (?,?,?,?,?)")
      .run("customer-a", "a@example.test", "scrypt$abc$def", "Customer A", new Date().toISOString());
    db.prepare("INSERT INTO customers (id,email,password_hash,display_name,created_at) VALUES (?,?,?,?,?)")
      .run("customer-b", "b@example.test", "scrypt$abc$def", "Customer B", new Date().toISOString());
    db.prepare("INSERT INTO agents (id,name,organization,customer_id,created_at) VALUES (?,?,?,?,?)")
      .run("agent-a", "Agent A", "A", "customer-a", new Date().toISOString());

    const owned = db.prepare("SELECT id FROM agents WHERE customer_id=?").all("customer-a") as Array<{ id: string }>;
    const other = db.prepare("SELECT id FROM agents WHERE customer_id=?").all("customer-b") as Array<{ id: string }>;
    assert.deepEqual(owned.map((row) => row.id), ["agent-a"]);
    assert.deepEqual(other, []);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("database migrates an existing agents table without customer_id", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "godsgate-migrate-"));
  const file = path.join(directory, "legacy.sqlite");
  const Database = (await import("better-sqlite3")).default;
  const legacy = new Database(file);
  legacy.exec("CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, organization TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT)");
  legacy.close();

  const db = openDatabase(file);
  try {
    const columns = db.pragma("table_info(agents)") as Array<{ name: string }>;
    assert.ok(columns.some((column) => column.name === "customer_id"));
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
