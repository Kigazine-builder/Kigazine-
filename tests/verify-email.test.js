import test from "node:test";
import assert from "node:assert/strict";
import handler, { assessHunterResult } from "../api/verify-email.js";

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

test("score must be strictly greater than 60", () => {
  assert.equal(assessHunterResult({ score: 60, status: "valid" }).allowed, false);
  assert.equal(assessHunterResult({ score: 61, status: "accept_all" }).allowed, true);
  assert.equal(assessHunterResult({ score: 50, status: "valid", webmail: true }).allowed, false);
  assert.equal(assessHunterResult({ score: 99, status: "invalid" }).allowed, false);
  assert.throws(() => assessHunterResult({ score: undefined, status: "valid" }));
});

test("missing key fails closed and never calls Hunter", async () => {
  const previous = process.env.HUNTER_API_KEY;
  delete process.env.HUNTER_API_KEY;
  const res = response();
  await handler({ method: "POST", headers: { origin: "https://kigazine.com" }, body: { email: "test@example.com" } }, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.error, "verification_not_configured");
  if (previous !== undefined) process.env.HUNTER_API_KEY = previous;
});

test("server calls Hunter without returning its key to the browser", async () => {
  const previousKey = process.env.HUNTER_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.HUNTER_API_KEY = "secret-test-value";
  let upstreamUrl;
  globalThis.fetch = async url => {
    upstreamUrl = url;
    return { ok: true, status: 200, json: async () => ({ data: { score: 61, status: "valid" } }) };
  };
  try {
    const res = response();
    await handler({ method: "POST", headers: { origin: "https://kigazine.com", "x-vercel-forwarded-for": "192.0.2.123" }, body: { email: "test@example.com" } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, { allowed: true, score: 61, status: "valid" });
    assert.equal(new URL(upstreamUrl).searchParams.get("api_key"), "secret-test-value");
    assert.equal(JSON.stringify(res.body).includes("secret-test-value"), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.HUNTER_API_KEY;
    else process.env.HUNTER_API_KEY = previousKey;
  }
});

test("in-progress verification cannot create a positive result", async () => {
  const previousKey = process.env.HUNTER_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.HUNTER_API_KEY = "secret-test-value";
  globalThis.fetch = async () => ({ ok: true, status: 202 });
  try {
    const res = response();
    await handler({ method: "POST", headers: { origin: "https://kigazine.com", "x-vercel-forwarded-for": "192.0.2.124" }, body: { email: "test@example.com" } }, res);
    assert.equal(res.code, 503);
    assert.equal(res.body.error, "verification_pending");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.HUNTER_API_KEY;
    else process.env.HUNTER_API_KEY = previousKey;
  }
});
