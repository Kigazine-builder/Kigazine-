"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dayKey, recentAuthTime, becameApproved } = require("./analytics-core");

test("daily keys use UTC boundaries", () => {
  assert.equal(dayKey(Date.parse("2026-09-29T23:59:59Z")), "2026-09-29");
  assert.equal(dayKey(Date.parse("2026-09-30T00:00:00Z")), "2026-09-30");
});

test("only a recent verified authentication time can count as a sign-in", () => {
  const now = Date.parse("2026-09-29T10:00:00Z");
  assert.equal(recentAuthTime(now / 1000, now), true);
  assert.equal(recentAuthTime((now - 11 * 60000) / 1000, now), false);
  assert.equal(recentAuthTime((now + 2 * 60000) / 1000, now), false);
  assert.equal(recentAuthTime("2026-09-29", now), false);
});

test("an approval is counted only on its first status transition", () => {
  assert.equal(becameApproved({ status: "pending_review" }, { status: "approved" }), true);
  assert.equal(becameApproved({ status: "approved" }, { status: "approved" }), false);
  assert.equal(becameApproved({ status: "needs_review" }, { status: "blocked" }), false);
});
