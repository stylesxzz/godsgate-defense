import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const honeypotPatterns = [
  /^\/(?:\.env(?:\.|$)|\.git(?:\/|$))/i,
  /^\/(?:wp-admin|wp-login\.php|xmlrpc\.php)(?:\/|$)/i,
  /^\/(?:phpmyadmin|pma|adminer)(?:\/|$)/i,
  /^\/(?:actuator|cgi-bin|server-status)(?:\/|$)/i,
  /^\/(?:vendor\/phpunit|\.aws|\.ssh)(?:\/|$)/i,
  /^\/(?:config\.php|backup\.zip|database\.sql)(?:$|\/)/i
];

export function isHoneypotPath(pathname: string) {
  return honeypotPatterns.some((pattern) => pattern.test(pathname));
}

export function classifyAgent(lastSeenAt: string | null, licenseExpiresAt: string | null, now = Date.now()) {
  const expires = licenseExpiresAt ? Date.parse(licenseExpiresAt) : 0;
  const lastSeen = lastSeenAt ? Date.parse(lastSeenAt) : 0;
  if (!expires || expires <= now) return "renewal_due";
  if (expires - now <= 7 * 24 * 60 * 60 * 1000) return "renewal_due";
  if (!lastSeen || now - lastSeen > 3 * 60 * 1000) return "offline";
  return "active";
}

export function addOneCalendarMonth(from: Date) {
  const next = new Date(from);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}