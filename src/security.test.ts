import test from "node:test";
import assert from "node:assert/strict";
import { classifyAgent, isHoneypotPath, addOneCalendarMonth } from "./security.js";

test("honeypot recognizes common secret and CMS probes", () => {
  assert.equal(isHoneypotPath("/.env"), true);
  assert.equal(isHoneypotPath("/wp-admin/"), true);
  assert.equal(isHoneypotPath("/api/health"), false);
  assert.equal(isHoneypotPath("/"), false);
});

test("agent classification prioritizes expired subscription", () => {
  const now = Date.now();
  assert.equal(classifyAgent(new Date(now).toISOString(), null, now), "renewal_due");
  assert.equal(classifyAgent(new Date(now).toISOString(), new Date(now - 1).toISOString(), now), "renewal_due");
  assert.equal(classifyAgent(new Date(now - 5 * 60_000).toISOString(), new Date(now + 30 * 86_400_000).toISOString(), now), "offline");
  assert.equal(classifyAgent(new Date(now).toISOString(), new Date(now + 30 * 86_400_000).toISOString(), now), "active");
});

test("calendar renewal clamps end-of-month dates", () => {
  const value = addOneCalendarMonth(new Date("2026-01-31T00:00:00.000Z"));
  assert.equal(value.toISOString(), "2026-02-28T00:00:00.000Z");
});