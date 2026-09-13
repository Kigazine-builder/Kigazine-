import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { addMonths, dueCollection, nextCollection, publicationSlot, subjectKey, zonedTime } from "./functions/apple-times-core.js";

const html = readFileSync("./apple-times.html", "utf8");
const index = readFileSync("./index.html", "utf8");
const rules = readFileSync("./firestore.rules", "utf8");
const functions = readFileSync("./functions/apple-times.js", "utf8");

assert.match(html, /<title>Apple Times · Kigazine<\/title>/);
assert.match(index, /href="https:\/\/appletimes\.kigazine\.com"/);
assert.match(html, /appleTimesSections/);
assert.match(html, /appleTimesWriters/);
assert.match(html, /appleTimesIssues/);
assert.match(html, /Hand in section/);
assert.match(html, /AI completion is waiting for editor review/);
assert.match(readFileSync("./vercel.json", "utf8"), /appletimes\.kigazine\.com/);
assert.match(functions, /onSchedule/);
assert.match(functions, /appleTimesAutoCollect/);
assert.match(functions, /completeWithAI/);
assert.match(rules, /match \/appleTimesWriters\/\{uid\}/);
assert.match(rules, /match \/appleTimesSections\/\{sectionId\}/);
assert.match(rules, /match \/appleTimesIssues\/\{issueId\}/);
assert.doesNotMatch(rules, /match \/arcadeGames\/\{gameId\}/);
assert.doesNotMatch(rules, /match \/hq\/\{docId\}/);

const config = { firstCollection: "2026-09-16", firstPublication: "2026-11-18", deadlineTime: "18:00", timeZone: "Asia/Shanghai", extensionThreshold: 5, enabled: true };
assert.equal(new Date(zonedTime("2026-09-16", "18:00", "Asia/Shanghai")).toISOString(), "2026-09-16T10:00:00.000Z");
assert.equal(nextCollection(config, Date.parse("2026-09-13T00:00:00Z")).date, "2026-09-16");
assert.equal(dueCollection(config, Date.parse("2026-10-01T00:00:00Z")).date, "2026-09-30");
assert.equal(addMonths("2026-11-18", 2), "2027-01-18");
assert.equal(publicationSlot(config, 2).date, "2027-01-18");
assert.equal(subjectKey("  Math   Games "), "math games");
console.log("Apple Times validation passed.");
