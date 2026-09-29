"use strict";

const METRICS = Object.freeze([
  "accountsCreated",
  "signIns",
  "magazinesSubmitted",
  "magazinesApproved",
  "commentsSubmitted",
  "commentsApproved"
]);

function dayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function recentAuthTime(value, now = Date.now()) {
  return Number.isInteger(value) && value > 0 &&
    now - value * 1000 >= -60000 && now - value * 1000 <= 10 * 60000;
}

function becameApproved(before, after) {
  return before?.status !== "approved" && after?.status === "approved";
}

module.exports = { METRICS, dayKey, recentAuthTime, becameApproved };
