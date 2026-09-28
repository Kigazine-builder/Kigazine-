const ALLOWED_ORIGINS = new Set([
  "https://kigazine.com",
  "https://www.kigazine.com"
]);
const REQUEST_LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;
const requestsByIp = new Map();

export function assessHunterResult(data) {
  const score = data?.score;
  if (!Number.isInteger(score) || score < 0 || score > 100 || typeof data?.status !== "string") {
    throw new Error("Invalid verification response");
  }
  return {
    allowed: score > 60 && data.status !== "invalid" && data.disposable !== true,
    score,
    status: data.status
  };
}

function allowRequest(ip) {
  const now = Date.now();
  if (requestsByIp.size > 10000) {
    for (const [key, entry] of requestsByIp) {
      if (entry.resetAt <= now) requestsByIp.delete(key);
    }
  }
  const entry = requestsByIp.get(ip);
  if (!entry || entry.resetAt <= now) {
    requestsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= REQUEST_LIMIT) return false;
  entry.count += 1;
  return true;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  if (!ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: "origin_not_allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "invalid_email" });
  }
  if (!process.env.HUNTER_API_KEY) {
    return res.status(503).json({ error: "verification_not_configured" });
  }

  // This protects against casual repeated requests. Configure a shared rate
  // limit or WAF before enabling a paid Hunter key at significant traffic.
  const ip = String(req.headers["x-vercel-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0].trim();
  if (!allowRequest(ip)) return res.status(429).json({ error: "too_many_requests" });

  const params = new URLSearchParams({ email, api_key: process.env.HUNTER_API_KEY });
  try {
    const response = await fetch(`https://api.hunter.io/v2/email-verifier?${params}`, {
      signal: AbortSignal.timeout(26000)
    });
    if (response.status === 202 || response.status === 222) {
      return res.status(503).json({ error: "verification_pending" });
    }
    if (response.status === 400 || response.status === 451) {
      return res.status(422).json({ error: "email_cannot_be_verified" });
    }
    if (!response.ok) return res.status(503).json({ error: "verification_unavailable" });
    const result = assessHunterResult((await response.json()).data);
    return res.status(200).json(result);
  } catch {
    return res.status(503).json({ error: "verification_unavailable" });
  }
}
